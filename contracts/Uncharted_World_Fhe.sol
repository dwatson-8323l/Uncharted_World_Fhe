pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract UnchartedWorldFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public batchClosed;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted world state
    mapping(uint256 => mapping(uint256 => euint32)) public encryptedResourceDistribution; // batchId => tileId => encrypted resource value
    mapping(uint256 => euint32) public encryptedTotalResourcesInBatch; // batchId => encrypted total resources

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event ResourceSubmitted(address indexed provider, uint256 batchId, uint256 tileId, bytes32 encryptedResource);
    event DecryptionRequested(uint256 indexed requestId, uint256 batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId, uint256 totalResources);

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error PausedState();
    error CooldownActive();
    error InvalidBatch();
    error BatchClosedForSubmissions();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedState();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        _openNewBatch(); // Open initial batch
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert PausedState(); // Already unpaused
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openNewBatch() external onlyOwner {
        _openNewBatch();
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        if (batchId != currentBatchId) revert InvalidBatch();
        if (batchClosed[batchId]) revert BatchClosedForSubmissions(); // Already closed
        batchClosed[batchId] = true;
        emit BatchClosed(batchId);
    }

    function submitEncryptedResource(uint256 tileId, euint32 encryptedResource) external onlyProvider whenNotPaused checkCooldown {
        if (batchClosed[currentBatchId]) revert BatchClosedForSubmissions();

        _initIfNeeded(encryptedResource);

        encryptedResourceDistribution[currentBatchId][tileId] = encryptedResource;
        if (!FHE.isInitialized(encryptedTotalResourcesInBatch[currentBatchId])) {
            encryptedTotalResourcesInBatch[currentBatchId] = FHE.asEuint32(0);
        }
        encryptedTotalResourcesInBatch[currentBatchId] = encryptedTotalResourcesInBatch[currentBatchId].add(encryptedResource);

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit ResourceSubmitted(msg.sender, currentBatchId, tileId, encryptedResource.toBytes32());
    }

    function requestTotalResourcesDecryption(uint256 batchId) external whenNotPaused checkCooldown {
        if (batchId > currentBatchId) revert InvalidBatch();
        if (!FHE.isInitialized(encryptedTotalResourcesInBatch[batchId])) revert InvalidBatch(); // Batch has no data or doesn't exist

        euint32 encryptedTotal = encryptedTotalResourcesInBatch[batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedTotal.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // @dev Replay protection: ensure this callback hasn't been processed for this requestId
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // @dev State consistency check: ensure the ciphertexts that were encrypted haven't changed
        // since the decryption was requested. This prevents certain front-running or MEV attacks.
        DecryptionContext memory context = decryptionContexts[requestId];
        euint32 encryptedTotal = encryptedTotalResourcesInBatch[context.batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedTotal.toBytes32();
        bytes32 currentHash = _hashCiphertexts(cts);

        if (currentHash != context.stateHash) revert StateMismatch();

        // @dev Verify the proof of correct decryption from the FHEVM network
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidProof();

        // Decode cleartexts in the same order as `cts` was prepared
        uint256 totalResources = abi.decode(cleartexts, (uint256));

        context.processed = true;
        decryptionContexts[requestId] = context; // Update storage

        emit DecryptionCompleted(requestId, context.batchId, totalResources);
    }

    function _openNewBatch() internal {
        currentBatchId++;
        batchClosed[currentBatchId] = false;
        emit BatchOpened(currentBatchId);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 value) internal pure {
        if (!FHE.isInitialized(value)) {
            revert("FHE value not initialized");
        }
    }

    function _requireInitialized(euint32 value) internal pure {
        if (!FHE.isInitialized(value)) {
            revert("FHE value not initialized");
        }
    }
}
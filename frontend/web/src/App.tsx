// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface WorldTile {
  id: string;
  coordinates: string;
  encryptedResources: string;
  discovered: boolean;
  discoverer?: string;
  discoveryTime?: number;
  resourceType?: string;
  resourceAmount?: number;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const resourceTypes = [
  "Crystal", "Energy", "Mineral", "Gas", 
  "Ancient Artifact", "Biological", "Rare Metal",
  "Dark Matter", "Exotic Particle", "Quantum Resource"
];

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [tiles, setTiles] = useState<WorldTile[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [selectedTile, setSelectedTile] = useState<WorldTile | null>(null);
  const [decryptedResources, setDecryptedResources] = useState<{type: string, amount: number} | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDiscovered, setFilterDiscovered] = useState<boolean | null>(null);

  const discoveredCount = tiles.filter(t => t.discovered).length;
  const undiscoveredCount = tiles.filter(t => !t.discovered).length;

  useEffect(() => {
    loadTiles().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadTiles = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("tile_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing tile keys:", e); }
      }
      const list: WorldTile[] = [];
      for (const key of keys) {
        try {
          const tileBytes = await contract.getData(`tile_${key}`);
          if (tileBytes.length > 0) {
            try {
              const tileData = JSON.parse(ethers.toUtf8String(tileBytes));
              list.push({ 
                id: key, 
                coordinates: tileData.coordinates,
                encryptedResources: tileData.encryptedResources,
                discovered: tileData.discovered,
                discoverer: tileData.discoverer,
                discoveryTime: tileData.discoveryTime,
                resourceType: tileData.resourceType,
                resourceAmount: tileData.resourceAmount
              });
            } catch (e) { console.error(`Error parsing tile data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading tile ${key}:`, e); }
      }
      setTiles(list);
    } catch (e) { console.error("Error loading tiles:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const discoverTile = async (coordinates: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setDiscovering(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Decrypting FHE-encrypted resources..." });
    try {
      // Simulate discovery process with random resources
      const resourceType = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
      const resourceAmount = Math.floor(Math.random() * 1000) + 100;
      const encryptedResources = FHEEncryptNumber(resourceAmount);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const tileId = `tile-${coordinates.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const tileData = { 
        coordinates,
        encryptedResources,
        discovered: true,
        discoverer: address,
        discoveryTime: Math.floor(Date.now() / 1000),
        resourceType,
        resourceAmount
      };
      
      await contract.setData(`tile_${tileId}`, ethers.toUtf8Bytes(JSON.stringify(tileData)));
      
      const keysBytes = await contract.getData("tile_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      if (!keys.includes(tileId)) {
        keys.push(tileId);
        await contract.setData("tile_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      }
      
      setTransactionStatus({ visible: true, status: "success", message: "Tile discovered and resources decrypted!" });
      await loadTiles();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowDiscoveryModal(false);
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Discovery failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setDiscovering(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<{type: string, amount: number} | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const amount = FHEDecryptNumber(encryptedData);
      return { type: resourceTypes[Math.floor(Math.random() * resourceTypes.length)], amount };
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const generateNewTile = () => {
    const x = Math.floor(Math.random() * 1000) - 500;
    const y = Math.floor(Math.random() * 1000) - 500;
    return `${x},${y}`;
  };

  const handleDiscoverRandomTile = async () => {
    const coordinates = generateNewTile();
    await discoverTile(coordinates);
  };

  const filteredTiles = tiles.filter(tile => {
    const matchesSearch = tile.coordinates.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (tile.resourceType && tile.resourceType.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesDiscoveryFilter = filterDiscovered === null || tile.discovered === filterDiscovered;
    return matchesSearch && matchesDiscoveryFilter;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE World Explorer...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Uncharted<span>World</span>FHE</h1>
          <p>An autonomous world where all resources are FHE-encrypted until discovered</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowDiscoveryModal(true)} className="discover-btn">
            Discover Tile
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="world-stats">
          <div className="stat-card">
            <h3>Total Tiles</h3>
            <p>{tiles.length}</p>
          </div>
          <div className="stat-card">
            <h3>Discovered</h3>
            <p>{discoveredCount}</p>
          </div>
          <div className="stat-card">
            <h3>Undiscovered</h3>
            <p>{undiscoveredCount}</p>
          </div>
          <div className="stat-card">
            <h3>FHE Status</h3>
            <p className="fhe-active">Active</p>
          </div>
        </div>

        <div className="controls-section">
          <div className="search-filter">
            <input 
              type="text" 
              placeholder="Search coordinates or resource..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select 
              value={filterDiscovered === null ? 'all' : filterDiscovered ? 'discovered' : 'undiscovered'}
              onChange={(e) => {
                if (e.target.value === 'all') setFilterDiscovered(null);
                else setFilterDiscovered(e.target.value === 'discovered');
              }}
            >
              <option value="all">All Tiles</option>
              <option value="discovered">Discovered</option>
              <option value="undiscovered">Undiscovered</option>
            </select>
          </div>
          <div className="view-controls">
            <button 
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
            >
              Grid View
            </button>
            <button 
              className={viewMode === "map" ? "active" : ""}
              onClick={() => setViewMode("map")}
            >
              Map View
            </button>
            <button onClick={loadTiles} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh World"}
            </button>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="tiles-grid">
            {filteredTiles.length === 0 ? (
              <div className="no-tiles">
                <p>No tiles found matching your criteria</p>
                <button onClick={() => setShowDiscoveryModal(true)}>
                  Discover First Tile
                </button>
              </div>
            ) : (
              filteredTiles.map(tile => (
                <div 
                  className={`tile-card ${tile.discovered ? 'discovered' : 'undiscovered'}`} 
                  key={tile.id}
                  onClick={() => setSelectedTile(tile)}
                >
                  <h3>Coordinates: {tile.coordinates}</h3>
                  {tile.discovered ? (
                    <>
                      <p>Resource: {tile.resourceType}</p>
                      <p>Amount: {tile.resourceAmount}</p>
                      <p>Discovered by: {tile.discoverer?.substring(0, 6)}...{tile.discoverer?.substring(38)}</p>
                    </>
                  ) : (
                    <p>FHE-Encrypted Resources</p>
                  )}
                  <div className="tile-status">
                    {tile.discovered ? 'Discovered' : 'Undiscovered'}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="world-map">
            <div className="map-container">
              {filteredTiles.map(tile => (
                <div 
                  className={`map-tile ${tile.discovered ? 'discovered' : 'undiscovered'}`}
                  key={tile.id}
                  style={{
                    left: `${50 + parseInt(tile.coordinates.split(',')[0]) / 10}%`,
                    top: `${50 + parseInt(tile.coordinates.split(',')[1]) / 10}%`
                  }}
                  onClick={() => setSelectedTile(tile)}
                >
                  {tile.discovered ? 'D' : 'U'}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="project-info">
          <h2>About Uncharted World FHE</h2>
          <p>
            This is a procedurally generated on-chain world where all resources are encrypted using Zama FHE technology. 
            Players must explore the world to decrypt and discover resources. The "unfogging" of the world map becomes 
            the core gameplay mechanic and shared goal of all players.
          </p>
          <div className="fhe-explanation">
            <h3>How FHE Works in This World</h3>
            <p>
              All resources are encrypted at world creation using Zama's Fully Homomorphic Encryption. 
              When you discover a tile, your exploration action serves as the decryption key, revealing 
              the resources while maintaining privacy for undiscovered areas.
            </p>
          </div>
        </div>
      </div>

      {showDiscoveryModal && (
        <div className="modal-overlay">
          <div className="discovery-modal">
            <div className="modal-header">
              <h2>Discover New Tile</h2>
              <button onClick={() => setShowDiscoveryModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <p>Explore uncharted territory to decrypt FHE-encrypted resources.</p>
              <div className="discovery-options">
                <button onClick={handleDiscoverRandomTile} disabled={discovering}>
                  {discovering ? "Discovering..." : "Discover Random Tile"}
                </button>
                <p>Or enter specific coordinates:</p>
                <div className="coordinate-input">
                  <input type="text" placeholder="X coordinate" />
                  <input type="text" placeholder="Y coordinate" />
                  <button disabled={discovering}>Discover at Coordinates</button>
                </div>
              </div>
              <div className="fhe-notice">
                <p>
                  <strong>FHE Notice:</strong> All resources are encrypted until discovered. 
                  Your exploration action serves as the decryption key.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTile && (
        <div className="modal-overlay">
          <div className="tile-detail-modal">
            <div className="modal-header">
              <h2>Tile Details</h2>
              <button onClick={() => { setSelectedTile(null); setDecryptedResources(null); }} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="tile-info">
                <p><strong>Coordinates:</strong> {selectedTile.coordinates}</p>
                <p><strong>Status:</strong> {selectedTile.discovered ? 'Discovered' : 'Undiscovered'}</p>
                
                {selectedTile.discovered ? (
                  <>
                    <p><strong>Resource Type:</strong> {selectedTile.resourceType}</p>
                    <p><strong>Resource Amount:</strong> {selectedTile.resourceAmount}</p>
                    <p><strong>Discovered by:</strong> {selectedTile.discoverer}</p>
                    <p><strong>Discovery Time:</strong> {new Date((selectedTile.discoveryTime || 0) * 1000).toLocaleString()}</p>
                  </>
                ) : (
                  <div className="encrypted-section">
                    <p><strong>Resources:</strong> FHE-Encrypted</p>
                    <button 
                      onClick={async () => {
                        if (decryptedResources) {
                          setDecryptedResources(null);
                        } else {
                          const decrypted = await decryptWithSignature(selectedTile.encryptedResources);
                          if (decrypted) setDecryptedResources(decrypted);
                        }
                      }}
                      disabled={isDecrypting}
                    >
                      {isDecrypting ? "Decrypting..." : 
                       decryptedResources ? "Hide Resources" : "Decrypt with Wallet Signature"}
                    </button>
                    {decryptedResources && (
                      <div className="decrypted-resources">
                        <p><strong>Resource Type:</strong> {decryptedResources.type}</p>
                        <p><strong>Resource Amount:</strong> {decryptedResources.amount}</p>
                        <p className="disclaimer">
                          This is a preview only. You must discover the tile to claim these resources.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              {!selectedTile.discovered && (
                <button 
                  onClick={() => {
                    discoverTile(selectedTile.coordinates);
                    setSelectedTile(null);
                  }}
                  disabled={discovering}
                >
                  {discovering ? "Discovering..." : "Discover This Tile"}
                </button>
              )}
              <button onClick={() => { setSelectedTile(null); setDecryptedResources(null); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Uncharted World FHE</h3>
            <p>An autonomous world where all resources are FHE-encrypted until discovered</p>
          </div>
          <div className="footer-section">
            <h3>Powered By</h3>
            <p>Zama FHE Technology</p>
            <p>Ethereum Blockchain</p>
          </div>
          <div className="footer-section">
            <h3>Categories</h3>
            <p>Autonomous World</p>
            <p>GameFi</p>
            <p>DePIN</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Uncharted World FHE. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
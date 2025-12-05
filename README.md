# Uncharted World: An Autonomous and Encrypted Gaming Experience 🌍🔍

Uncharted World is a revolutionary gaming platform where all resources are FHE-encrypted until discovered, driven by **Zama's Fully Homomorphic Encryption technology**. This programmatically generated, massive on-chain universe invites players to engage in an epic journey of exploration, allowing them to unlock hidden treasures and resources while protecting user privacy.

## The Challenge: Unlocking Hidden Worlds

Traditional gaming landscapes often operate in a rigid framework, where players can easily exhaust available resources or have limited exploration opportunities. Players seeking an engaging experience often confront the challenge of discovering new lands and hidden treasures while navigating concerns about privacy and data security. As game economies evolve, the need for private and secure exploration becomes paramount.

## How FHE Transforms the Gaming Landscape

Zama's Fully Homomorphic Encryption (FHE) technology addresses these challenges by allowing resources to be encrypted from the start. Players can participate in a DePIN-style exploration to gradually decrypt and unveil the world around them. With the implementation of Zama's open-source libraries—such as **Concrete**, **TFHE-rs**, and the **zama-fhe SDK**—Uncharted World ensures that player actions remain confidential and secure while delivering exhilarating gameplay.

## Core Features

- **FHE-Encrypted Resources:** All in-game resources are encrypted, adding a layer of security to player interactions.
- **Exploration-Centric Gameplay:** Players must engage in exploration to unlock and decrypt the world, making discovery the core gameplay loop.
- **Collaborative Objectives:** Uncovering the map together transforms exploration into a shared adventure.
- **Rich Sandbox Environment:** The game offers a vast landscape filled with procedurally generated terrains, biomes, and resources waiting to be discovered.
- **Epic Discovery Experience:** Drive a compelling narrative through quests and explorations, diving deep into a world that continuously evolves.

## Technology Stack

- **Zama's FHE SDK:** The backbone of confidential computing in Uncharted World.
- **Node.js:** For server-side programming and game logic.
- **Hardhat:** For Ethereum development framework.
- **Solidity:** Smart contract programming language.
- **IPFS:** For decentralized storage of game assets.

## Directory Structure

Here’s a glance at how the project files are organized:

```
Uncharted_World_Fhe/
├── contracts/
│   └── Uncharted_World.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── Uncharted_World.test.js
├── src/
│   ├── index.js
│   ├── utils.js
│   └── gameLogic.js
├── package.json
└── README.md
```

## Installation Instructions

To set up Uncharted World, follow these steps after downloading the project files:

1. **Install Node.js:** Ensure you have Node.js installed. If not, download it from the official website.
2. **Install Hardhat:** Make sure you have Hardhat installed globally using the command:
   ```bash
   npm install -g hardhat
   ```
3. **Navigate to the project directory:** Open your terminal and change to the project directory.
4. **Install Dependencies:** Run the following command to install the necessary packages, including Zama's FHE libraries:
   ```bash
   npm install
   ```

> **Note:** Do NOT use `git clone` or any URLs in this process.

## Building & Running Uncharted World

Once you've installed all dependencies, compile and test the project with the following commands:

- To compile the smart contracts:
  ```bash
  npx hardhat compile
  ```

- To run tests and ensure everything works:
  ```bash
  npx hardhat test
  ```

- To deploy the contracts on your local environment:
  ```bash
  npx hardhat run scripts/deploy.js
  ```

## Example Code Snippet

Below is an example of how a simple function for resource discovery might look in your game logic:

```javascript
// gameLogic.js
async function discoverResource(playerId, coordinates) {
    const resource = await fetchResourceCoordinates(coordinates);
    if (resource.isEncrypted) {
        const decryptedResource = await decryptResource(resource);
        console.log(`Player ${playerId} discovered: `, decryptedResource);
    } else {
        console.log(`Player ${playerId} found: `, resource);
    }
}
```

This function checks if the resource at the specified coordinates is encrypted and, if so, decrypts it using Zama's FHE capabilities before revealing it to the player.

## Acknowledgements

### Powered by Zama

We extend our heartfelt gratitude to the Zama team for their pioneering work in the field of Fully Homomorphic Encryption. Their innovative open-source tools make it possible to build secure and confidential blockchain applications like Uncharted World. Together, we forge a path for a new era in gaming where exploration and privacy go hand in hand.

---

Embark on a journey like no other; unlock the secrets of Uncharted World and delve into an autonomous realm that continuously evolves as you explore. Join fellow adventurers today! 🌐✨

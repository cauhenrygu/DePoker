// src/depokerConfig.js

import depokerJson from "./abi/DePoker.json";

export const DEPOKER_CONTRACT_ADDRESS =
  "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // TODO: 换成你自己的部署地址

export const DEPOKER_CONTRACT_ABI = depokerJson.abi;

// Hardhat 本地链的默认 chainId
export const HARDHAT_CHAIN_ID = 31337;

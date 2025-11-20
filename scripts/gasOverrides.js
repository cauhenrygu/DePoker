// scripts/gasOverrides.js
//
// 小工具：统一生成 gas 参数，优先用 EIP-1559（maxFeePerGas / maxPriorityFeePerGas）
// 如果当前网络没有 EIP-1559 数据，则退回到 gasPrice
//
// 用法示例：
//
//   const { getGasOverrides } = require("./gasOverrides");
//   const gas = await getGasOverrides();
//
//   await depoker.connect(p1).joinRoom(roomId, {
//     value: buyIn,
//     ...gas,
//   });

const { ethers } = require("hardhat");

async function getGasOverrides(multiplier = 1n) {
  const feeData = await ethers.provider.getFeeData();

  // 优先使用 EIP-1559 风格
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    return {
      maxFeePerGas: feeData.maxFeePerGas * multiplier,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };
  }

  // 其次退回到 gasPrice
  if (feeData.gasPrice) {
    return {
      gasPrice: feeData.gasPrice * multiplier,
    };
  }

  // 如果连 feeData 都拿不到，就用一个固定的 2 gwei
  const fallbackGasPrice = ethers.parseUnits("2", "gwei");
  return {
    gasPrice: fallbackGasPrice,
  };
}

module.exports = {
  getGasOverrides,
};

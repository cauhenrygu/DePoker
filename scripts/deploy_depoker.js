// scripts/deploy_depoker.js

const { getGasOverrides } = require("./gasOverrides");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DePoker with account:", deployer.address);

  // 拿一份统一的 gas 参数（本地 network 会返回一个合理的值）
  const gas = await getGasOverrides();
  console.log("Using gas overrides:", gas);

  const DePoker = await ethers.getContractFactory("DePoker");

  // 没有构造参数，所以可以直接把 overrides 作为唯一参数传入
  const depoker = await DePoker.deploy(gas);

  await depoker.waitForDeployment();

  const addr = await depoker.getAddress();
  console.log("DePoker deployed at:", addr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

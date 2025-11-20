// scripts/deploy_depoker.js

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DePoker with account:", deployer.address);

  const DePoker = await ethers.getContractFactory("DePoker");
  const depoker = await DePoker.deploy();

  // ⚠️ ethers v6 写法：等待部署
  await depoker.waitForDeployment();

  const addr = await depoker.getAddress();
  console.log("DePoker deployed at:", addr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

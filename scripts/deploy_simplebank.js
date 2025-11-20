async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SimpleBank with account:", deployer.address);

  const Bank = await ethers.getContractFactory("SimpleBank");
  const bank = await Bank.deploy();

  await bank.waitForDeployment();

  const addr = await bank.getAddress();
  console.log("SimpleBank deployed at:", addr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

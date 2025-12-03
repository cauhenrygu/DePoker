// const hre = require("hardhat");

// async function main() {
//   const DePoker2 = await hre.ethers.getContractFactory("DePoker2");
//   const depoker2 = await DePoker2.deploy();
//   await depoker2.waitForDeployment();
//   console.log("DePoker2 deployed to:", await depoker2.getAddress());
// }

// main().catch((error) => {
//   console.error(error);
//   process.exitCode = 1;
// });



const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const DePoker2 = await hre.ethers.getContractFactory("DePoker2");
  const depoker2 = await DePoker2.deploy();
  await depoker2.waitForDeployment();

  const address = await depoker2.getAddress();
  console.log("DePoker2 deployed to:", address);

  const networkName = hre.network.name; // localhost / sepolia / ...
  const outDir = path.join(__dirname, "..", "deployments");
  const outPath = path.join(outDir, `${networkName}-DePoker2.json`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ address, network: networkName }, null, 2)
  );

  console.log("Saved deployment info to", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

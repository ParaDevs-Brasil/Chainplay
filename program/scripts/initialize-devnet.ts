import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join } from "path";

const PROGRAM_ID = new PublicKey("F4xhKysY8SrNwfqLZxyuJrZCWW8KPVbTjZWb4HHtD4ZA");
const BPF_LOADER_UPGRADEABLE_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
const FEE_BPS = 1000; // 10%

async function main() {
  const idl = JSON.parse(
    readFileSync(join(__dirname, "../target/idl/oddies_bet.json"), "utf8")
  );
  const walletPath = join(__dirname, "../keys/devnet-deploy-wallet.json");
  const secret = Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")));
  const keypair = anchor.web3.Keypair.fromSecretKey(secret);
  const wallet = new anchor.Wallet(keypair);

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );
  const [programDataPda] = PublicKey.findProgramAddressSync(
    [PROGRAM_ID.toBuffer()],
    BPF_LOADER_UPGRADEABLE_ID
  );

  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log("Config já existe em", configPda.toBase58(), "— nada a fazer.");
    const config = await (program.account as any).config.fetch(configPda);
    console.log(config);
    return;
  }

  // team_wallet = a própria wallet de deploy por enquanto; troque depois com
  // update_config quando tiverem uma wallet de tesouraria dedicada.
  const sig = await program.methods
    .initialize(FEE_BPS)
    .accounts({
      config: configPda,
      authority: keypair.publicKey,
      teamWallet: keypair.publicKey,
      program: PROGRAM_ID,
      programData: programDataPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("initialize() tx:", sig);
  console.log("config PDA:", configPda.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

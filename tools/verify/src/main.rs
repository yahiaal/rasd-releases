use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use std::{env, fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let [signature_path, installer_path]: [String; 2] = env::args()
        .skip(1)
        .collect::<Vec<_>>()
        .try_into()
        .map_err(|_| "Expected signature and installer paths")?;
    let key = env::var("RASD_UPDATE_PUBLIC_KEY")?;
    let signature = fs::read_to_string(signature_path)?;
    let key = String::from_utf8(STANDARD.decode(key.trim())?)?;
    let signature = String::from_utf8(STANDARD.decode(signature.trim())?)?;
    let installer = fs::read(installer_path)?;
    PublicKey::decode(&key)?.verify(&installer, &Signature::decode(&signature)?, true)?;
    println!("The installer signature matches the production updater key.");
    Ok(())
}

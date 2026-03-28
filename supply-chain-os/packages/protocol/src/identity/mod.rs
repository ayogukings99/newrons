use ed25519_dalek::{Keypair, PublicKey, SecretKey, Signer, Verifier, Signature};
use rand::rngs::OsRng;
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("key generation failed: {0}")]
    KeyGen(String),
    #[error("invalid DID format")]
    InvalidDid,
    #[error("signature verification failed")]
    VerificationFailed,
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// A Sovereign Node identity.
///
/// DID format:  `did:scn:<base58-encoded-public-key>`
///
/// The keypair is ed25519. The private key NEVER leaves the local node.
/// The public key is the node's permanent identity on the network.
#[derive(Debug)]
pub struct Identity {
    keypair: Keypair,
    pub did: String,
}

/// Serializable public profile — safe to share with peers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeProfile {
    pub did: String,
    pub public_key_hex: String,
    pub display_name: Option<String>,
    pub protocol_version: String,
}

impl Identity {
    /// Generate a fresh identity (first-run node genesis).
    pub fn generate() -> Result<Self, IdentityError> {
        let mut csprng = OsRng;
        let keypair = Keypair::generate(&mut csprng);
        let did = Self::pubkey_to_did(keypair.public);
        Ok(Self { keypair, did })
    }

    /// Reconstruct identity from stored secret key bytes.
    pub fn from_secret_bytes(secret_bytes: &[u8]) -> Result<Self, IdentityError> {
        let secret = SecretKey::from_bytes(secret_bytes)
            .map_err(|e| IdentityError::KeyGen(e.to_string()))?;
        let public = PublicKey::from(&secret);
        let keypair = Keypair { secret, public };
        let did = Self::pubkey_to_did(keypair.public);
        Ok(Self { keypair, did })
    }

    /// Export the secret key bytes for secure local storage.
    ///
    /// IMPORTANT: Store these bytes in the OS keychain / Tauri secure storage.
    /// Never write them to plain files or transmit them over the network.
    pub fn export_secret_bytes(&self) -> [u8; 32] {
        self.keypair.secret.to_bytes()
    }

    /// Sign arbitrary bytes. Used for event signing and P2P challenge-response.
    pub fn sign(&self, message: &[u8]) -> Vec<u8> {
        self.keypair.sign(message).to_bytes().to_vec()
    }

    /// Verify a signature against a known DID's public key.
    pub fn verify_signature(
        did: &str,
        message: &[u8],
        signature_bytes: &[u8],
    ) -> Result<(), IdentityError> {
        let pubkey = Self::did_to_pubkey(did)?;
        let sig = Signature::from_bytes(signature_bytes)
            .map_err(|_| IdentityError::VerificationFailed)?;
        pubkey
            .verify(message, &sig)
            .map_err(|_| IdentityError::VerificationFailed)
    }

    /// Public profile to share with peers during P2P handshake.
    pub fn public_profile(&self, display_name: Option<String>) -> NodeProfile {
        NodeProfile {
            did: self.did.clone(),
            public_key_hex: hex::encode(self.keypair.public.as_bytes()),
            display_name,
            protocol_version: crate::PROTOCOL_VERSION.to_string(),
        }
    }

    // ─── Internal helpers ───────────────────────────────────────────────────

    fn pubkey_to_did(pubkey: PublicKey) -> String {
        format!("did:scn:{}", bs58::encode(pubkey.as_bytes()).into_string())
    }

    pub fn did_to_pubkey(did: &str) -> Result<PublicKey, IdentityError> {
        let prefix = "did:scn:";
        if !did.starts_with(prefix) {
            return Err(IdentityError::InvalidDid);
        }
        let encoded = &did[prefix.len()..];
        let bytes = bs58::decode(encoded)
            .into_vec()
            .map_err(|_| IdentityError::InvalidDid)?;
        PublicKey::from_bytes(&bytes).map_err(|_| IdentityError::InvalidDid)
    }

    /// Content-address anything — used for dedup and DHT keys.
    pub fn hash_bytes(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_and_sign_roundtrip() {
        let identity = Identity::generate().unwrap();
        assert!(identity.did.starts_with("did:scn:"));

        let msg = b"hello sovereign world";
        let sig = identity.sign(msg);
        Identity::verify_signature(&identity.did, msg, &sig).expect("signature should verify");
    }

    #[test]
    fn test_secret_export_reimport() {
        let id1 = Identity::generate().unwrap();
        let secret = id1.export_secret_bytes();
        let id2 = Identity::from_secret_bytes(&secret).unwrap();
        assert_eq!(id1.did, id2.did);
    }
}

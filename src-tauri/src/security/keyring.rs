use keyring::Entry;

const SERVICE_NAME: &str = "kterminal";

pub struct CredentialStore;

impl CredentialStore {
    /// Store a password in the OS keyring, returns a reference key
    pub fn store_password(server_id: &str, password: &str) -> Result<String, keyring::Error> {
        let entry = Entry::new(SERVICE_NAME, server_id)?;
        entry.set_password(password)?;
        // Return a marker indicating the password is stored in keyring
        Ok(format!("keyring://{}", server_id))
    }

    /// Retrieve a password from the OS keyring
    pub fn get_password(server_id: &str) -> Result<String, keyring::Error> {
        let entry = Entry::new(SERVICE_NAME, server_id)?;
        entry.get_password()
    }

    /// Delete a password from the OS keyring
    pub fn delete_password(server_id: &str) -> Result<(), keyring::Error> {
        let entry = Entry::new(SERVICE_NAME, server_id)?;
        entry.delete_credential()
    }

    /// Check if a password reference points to the keyring
    pub fn is_keyring_ref(value: &str) -> bool {
        value.starts_with("keyring://")
    }

    /// Extract the server ID from a keyring reference
    pub fn extract_id_from_ref(value: &str) -> Option<&str> {
        value.strip_prefix("keyring://")
    }
}

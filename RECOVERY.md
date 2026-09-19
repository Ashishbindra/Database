# Account & Key Recovery Protocol

## 🔑 24-Word Standard BIP-39 Recovery Phrase Specification

1. **Entropy Generation**:
   * Uses `window.crypto.getRandomValues()` to generate 32 bytes (256 bits) of cryptographically secure random entropy.
2. **Checksum Calculation**:
   * Computes SHA-256 hash of the 256-bit entropy.
   * Extracts the first 8 bits as checksum ($256 / 32 = 8$ bits).
3. **Wordlist Mapping**:
   * Concatenates 256 entropy bits + 8 checksum bits = 264 bits total.
   * Splits into 24 chunks of 11 bits each ($264 / 11 = 24$).
   * Maps each 11-bit integer ($0 - 2047$) to the official BIP-39 English 2,048-word dictionary.
4. **Key Unwrapping**:
   * When recovering an account, the 24 words are validated against BIP-39 SHA-256 checksums.
   * Derives a seed via PBKDF2-SHA512 (2048 iterations) to unwrap the `recoveryWrappedDek` envelope stored on the server.

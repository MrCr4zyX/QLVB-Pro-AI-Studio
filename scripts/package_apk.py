#!/usr/bin/env python3
import os
import sys
import struct
import hashlib
import tempfile
import zipfile
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "dist"
PUBLIC_DIR = BASE_DIR / "public"
EXISTING_APK = PUBLIC_DIR / "k02_mobile_qlvb_1.8.apk"

def main():
    if not DIST_DIR.exists():
        print("dist directory does not exist. Run npm run build first.")
        sys.exit(1)

    print("Reading non-dist files from existing APK...")
    non_dist_files = {}
    with zipfile.ZipFile(EXISTING_APK, 'r') as z:
        for f in z.filelist:
            if not f.filename.startswith("assets/dist/") and not f.filename.startswith("META-INF/"):
                non_dist_files[f.filename] = z.read(f.filename)

    print(f"Loaded {len(non_dist_files)} non-dist entries: {list(non_dist_files.keys())}")

    # Read dist files
    dist_files = {}
    for root, _, files in os.walk(DIST_DIR):
        for file in files:
            full_path = Path(root) / file
            rel_path = full_path.relative_to(DIST_DIR).as_posix()
            if rel_path.endswith(('.apk', '.zip', '.idsig')):
                continue
            dist_files[f"assets/dist/{rel_path}"] = full_path.read_bytes()

    print(f"Loaded {len(dist_files)} dist entries from dist/")

    # Combine all files for APK
    all_apk_files = {}
    all_apk_files.update(non_dist_files)
    all_apk_files.update(dist_files)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        key_file = tmp_path / "key.pem"
        cert_file = tmp_path / "cert.pem"
        cert_der_file = tmp_path / "cert.der"
        pubkey_der_file = tmp_path / "pubkey.der"

        # Generate RSA key and self-signed certificate
        subprocess.run(["openssl", "genrsa", "-out", str(key_file), "2048"], check=True, stderr=subprocess.PIPE)
        subprocess.run([
            "openssl", "req", "-new", "-x509", "-key", str(key_file),
            "-out", str(cert_file), "-days", "10000",
            "-subj", "/C=US/O=Android/CN=Android Debug"
        ], check=True, stderr=subprocess.PIPE)

        subprocess.run(["openssl", "x509", "-in", str(cert_file), "-outform", "DER", "-out", str(cert_der_file)], check=True)
        subprocess.run(["openssl", "rsa", "-in", str(key_file), "-pubout", "-outform", "DER", "-out", str(pubkey_der_file)], check=True)

        cert_der = cert_der_file.read_bytes()
        pubkey_der = pubkey_der_file.read_bytes()

        # Step 1: Generate v1 signatures (MANIFEST.MF, ANDROIDD.SF, ANDROIDD.RSA)
        manifest_lines = [
            "Manifest-Version: 1.0",
            "Created-By: 1.8.0_352 (Android Debug)",
            ""
        ]

        sf_lines = [
            "Signature-Version: 1.0",
            "Created-By: 1.8.0_352 (Android Debug)",
        ]

        # Calculate SHA256 of each file
        file_sha256 = {}
        for name in sorted(all_apk_files.keys()):
            data = all_apk_files[name]
            digest_b64 = hashlib.sha256(data).digest()
            import base64
            b64_str = base64.b64encode(digest_b64).decode('ascii')
            file_sha256[name] = b64_str
            manifest_lines.append(f"Name: {name}")
            manifest_lines.append(f"SHA-256-Digest: {b64_str}")
            manifest_lines.append("")

        manifest_content = "\r\n".join(manifest_lines) + "\r\n"
        manifest_bytes = manifest_content.encode('utf-8')
        all_apk_files["META-INF/MANIFEST.MF"] = manifest_bytes

        import base64
        manifest_digest_b64 = base64.b64encode(hashlib.sha256(manifest_bytes).digest()).decode('ascii')
        sf_lines.append(f"SHA-256-Digest-Manifest: {manifest_digest_b64}")
        sf_lines.append("")

        for name in sorted(file_sha256.keys()):
            # Section digest of manifest entry
            section = f"Name: {name}\r\nSHA-256-Digest: {file_sha256[name]}\r\n\r\n".encode('utf-8')
            sec_digest = base64.b64encode(hashlib.sha256(section).digest()).decode('ascii')
            sf_lines.append(f"Name: {name}")
            sf_lines.append(f"SHA-256-Digest: {sec_digest}")
            sf_lines.append("")

        sf_content = "\r\n".join(sf_lines) + "\r\n"
        sf_bytes = sf_content.encode('utf-8')
        all_apk_files["META-INF/ANDROIDD.SF"] = sf_bytes

        # Sign ANDROIDD.SF with openssl smime to create ANDROIDD.RSA
        sf_file = tmp_path / "ANDROIDD.SF"
        rsa_file = tmp_path / "ANDROIDD.RSA"
        sf_file.write_bytes(sf_bytes)

        subprocess.run([
            "openssl", "smime", "-sign", "-in", str(sf_file),
            "-inkey", str(key_file), "-signer", str(cert_file),
            "-out", str(rsa_file), "-outform", "DER", "-nodetach"
        ], check=True)
        all_apk_files["META-INF/ANDROIDD.RSA"] = rsa_file.read_bytes()

        # Step 2: Build aligned ZIP archive
        raw_zip_file = tmp_path / "unsigned.apk"
        # We write files in deterministic order
        with zipfile.ZipFile(raw_zip_file, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            for name in sorted(all_apk_files.keys()):
                data = all_apk_files[name]
                # Keep uncompressed if image / audio / arsc
                compress = zipfile.ZIP_STORED if name.endswith(('.png', '.ico', '.arsc', '.jpg', '.mp4')) else zipfile.ZIP_DEFLATED
                z.writestr(name, data, compress_type=compress)

        zip_data = raw_zip_file.read_bytes()
        eocd_pos = zip_data.rfind(b"PK\x05\x06")
        cd_size, cd_offset = struct.unpack('<II', zip_data[eocd_pos+12:eocd_pos+20])

        sig_block_offset = cd_offset

        # Step 3: Compute APK Signature Scheme v2 top-level digest
        p1 = zip_data[:sig_block_offset]
        p2 = zip_data[cd_offset:eocd_pos]
        p3 = bytearray(zip_data[eocd_pos:])
        struct.pack_into('<I', p3, 16, sig_block_offset)

        chunks = []
        for p in [p1, p2, p3]:
            for i in range(0, len(p), 1048576):
                c = p[i:i+1048576]
                chunks.append(b'\xa5' + struct.pack('<I', len(c)) + c)

        chunk_digests = [hashlib.sha256(c).digest() for c in chunks]
        top_digest = hashlib.sha256(b'\x5a' + struct.pack('<I', len(chunk_digests)) + b''.join(chunk_digests)).digest()

        # Build v2 signed data:
        # 1. digests:
        #    one digest entry: uint32 sig_algo (0x0103), uint32 digest_len (32), 32-byte digest
        one_digest = struct.pack('<II', 0x0103, 32) + top_digest
        digests_block = struct.pack('<I', len(one_digest) + 4) + struct.pack('<I', len(one_digest)) + one_digest

        # 2. certificates:
        #    one cert entry: uint32 cert_len, cert_bytes
        one_cert = struct.pack('<I', len(cert_der)) + cert_der
        certs_block = struct.pack('<I', len(one_cert) + 4) + struct.pack('<I', len(one_cert)) + one_cert

        # 3. additional attributes (empty)
        attrs_block = struct.pack('<I', 0)

        # signed_data
        signed_data = digests_block + certs_block + attrs_block
        signed_data_with_len = struct.pack('<I', len(signed_data)) + signed_data

        # Sign signed_data with RSA-SHA256
        data_to_sign_file = tmp_path / "data_to_sign.bin"
        sig_out_file = tmp_path / "sig.bin"
        data_to_sign_file.write_bytes(signed_data)

        subprocess.run([
            "openssl", "dgst", "-sha256", "-sign", str(key_file),
            "-out", str(sig_out_file), str(data_to_sign_file)
        ], check=True)
        raw_signature = sig_out_file.read_bytes()

        # signatures block:
        # one sig entry: uint32 sig_entry_len, uint32 sig_algo (0x0103), uint32 raw_sig_len, raw_sig
        one_sig_inner = struct.pack('<II', 0x0103, len(raw_signature)) + raw_signature
        one_sig = struct.pack('<I', len(one_sig_inner)) + one_sig_inner
        signatures_block = struct.pack('<I', len(one_sig)) + one_sig

        # public key block:
        pubkey_block = struct.pack('<I', len(pubkey_der)) + pubkey_der

        # signer block:
        signer = signed_data_with_len + signatures_block + pubkey_block
        signer_with_len = struct.pack('<I', len(signer)) + signer
        all_signers = struct.pack('<I', len(signer_with_len)) + signer_with_len

        # v2 ID-value pair:
        pair_id = 0x7109871a
        pair_data = struct.pack('<I', pair_id) + all_signers
        pair_with_len = struct.pack('<Q', len(pair_data)) + pair_data

        # APK Signing Block:
        # uint64 total_size (excluding the first 8 bytes)
        # pairs
        # uint64 total_size
        # 16-byte magic: b"APK Sig Block 42"
        # Total block must be padded if needed, but standard is size_of_block = len(pairs) + 24
        # In fact total_size = len(pairs) + 8 + 16 (since total_size excludes first uint64)
        total_size = len(pair_with_len) + 8 + 16
        apk_sig_block = (
            struct.pack('<Q', total_size) +
            pair_with_len +
            struct.pack('<Q', total_size) +
            b"APK Sig Block 42"
        )

        # Assemble final APK:
        # Part 1: zip data before CD
        # Part 2: APK Signing Block
        # Part 3: Central Directory
        # Part 4: EOCD with new cd_offset
        new_cd_offset = sig_block_offset + len(apk_sig_block)
        final_eocd = bytearray(zip_data[eocd_pos:])
        struct.pack_into('<I', final_eocd, 16, new_cd_offset)

        final_apk_data = (
            zip_data[:sig_block_offset] +
            apk_sig_block +
            zip_data[cd_offset:eocd_pos] +
            bytes(final_eocd)
        )

        # Write to outputs
        outputs = [
            PUBLIC_DIR / "k02_mobile_qlvb_1.8.apk",
            PUBLIC_DIR / "k02_mobile_qlvb.apk",
            PUBLIC_DIR / "k02_mobile_qlvb_1.7.apk",
            DIST_DIR / "k02_mobile_qlvb_1.8.apk",
            DIST_DIR / "k02_mobile_qlvb.apk",
            DIST_DIR / "k02_mobile_qlvb_1.7.apk"
        ]
        for out in outputs:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(final_apk_data)
            print(f"Wrote {out} ({len(final_apk_data)} bytes)")

        # Create updated k02_web_html.zip
        web_zip_path = PUBLIC_DIR / "k02_web_html.zip"
        with zipfile.ZipFile(web_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(DIST_DIR):
                for file in files:
                    full_p = Path(root) / file
                    if full_p.suffix in ('.apk', '.zip', '.idsig'):
                        continue
                    rel_p = full_p.relative_to(DIST_DIR).as_posix()
                    z.write(full_p, rel_p)
        print(f"Wrote {web_zip_path} ({web_zip_path.stat().st_size} bytes)")
        dist_web_zip = DIST_DIR / "k02_web_html.zip"
        dist_web_zip.write_bytes(web_zip_path.read_bytes())

    print("All builds and packages updated successfully!")

if __name__ == "__main__":
    main()

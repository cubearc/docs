"""Install the pinned official mdBook binary into the ignored .tools directory."""
import hashlib
import io
import platform
import subprocess
import tarfile
import zipfile
from pathlib import Path

VERSION = "0.5.4"
ASSETS = {
    ("Darwin", "x86_64"): ("x86_64-apple-darwin.tar.gz", "a47d7bf0d5d670cff9ee6cce95537cbeb62dc10704d9e7131ffbd13e2b59a5de"),
    ("Darwin", "arm64"): ("aarch64-apple-darwin.tar.gz", "03e8a6d8b13a2971e0b3280affd03b388373c1485e26f73407c3a76b0b1838df"),
    ("Linux", "x86_64"): ("x86_64-unknown-linux-gnu.tar.gz", "3f28de05dafca9d0f2eab99c662116b0e37b89b1d96a08f8f430b9eeae958cd7"),
    ("Linux", "aarch64"): ("aarch64-unknown-linux-musl.tar.gz", "753e5c5c363ee8a56972344dcf91466f005a51db84a7aeffe427ae3ef83d6d44"),
    ("Windows", "AMD64"): ("x86_64-pc-windows-msvc.zip", "8a6b2421aa522de06d746871d2b8fff9c8d71773467e310a4516d2566e7f2de4"),
}


def install():
    key = (platform.system(), platform.machine())
    if key not in ASSETS:
        raise SystemExit(f"No pinned binary for {key}; install mdbook {VERSION} with Cargo.")
    asset, expected = ASSETS[key]
    url = f"https://github.com/rust-lang/mdBook/releases/download/v{VERSION}/mdbook-v{VERSION}-{asset}"
    data = subprocess.check_output(
        ["curl", "--fail", "--location", "--silent", "--show-error", "--max-time", "60", url]
    )
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit("mdBook download checksum mismatch.")
    name = "mdbook.exe" if key[0] == "Windows" else "mdbook"
    if asset.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            binary = archive.read(name)
    else:
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            member = archive.extractfile(name)
            if member is None:
                raise SystemExit("mdBook binary missing from archive.")
            binary = member.read()
    destination = Path(__file__).resolve().parents[1] / ".tools" / name
    destination.parent.mkdir(exist_ok=True)
    destination.write_bytes(binary)
    destination.chmod(0o755)
    print(destination)


if __name__ == "__main__":
    install()

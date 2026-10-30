"""Fetch the official offline Korean speech model; never overwrite an existing model."""
from pathlib import Path
import hashlib
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = "vosk-model-small-ko-0.22"
SHA256 = "eea36124087fed26c59996a4761519458e3bd185e8ea9d9865ad8760c4a1d989"
TARGET = ROOT / "android/app/src/main/assets/model-ko"


def main():
    marker = TARGET / "uuid"
    if marker.is_file() and marker.read_text().strip() == SHA256:
        if all((TARGET / name).is_file() for name in ("am/final.mdl", "conf/model.conf", "graph/HCLr.fst", "graph/Gr.fst")):
            print("Korean speech model is already prepared.")
            return
    if TARGET.exists() and any(TARGET.iterdir()):
        raise RuntimeError("Existing model is incomplete or different. Inspect it before replacing it.")
    archive = ROOT / "downloads" / f"{NAME}.zip"
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        urllib.request.urlretrieve(f"https://alphacephei.com/vosk/models/{NAME}.zip", archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise RuntimeError("Model archive checksum mismatch; no files were extracted.")
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            path = Path(entry.filename)
            if not path.parts or path.parts[0] != NAME:
                raise ValueError("Unexpected archive root")
            destination = (TARGET / Path(*path.parts[1:])).resolve()
            if not destination.is_relative_to(TARGET.resolve()):
                raise ValueError("Unsafe archive path")
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(package.read(entry))
    marker.write_text(SHA256, encoding="ascii")
    print("Korean speech model prepared and checksum verified.")


if __name__ == "__main__":
    main()

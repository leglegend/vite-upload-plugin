"""Sanity checks for the faucet-as-drawer-handle STL generator."""

import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from generate_stl import OUT, bounds, build_handle, write_binary_stl  # noqa: E402


def test_mesh_is_printable_handle() -> None:
    mesh = build_handle()
    mn, mx = bounds(mesh)
    size = mx - mn
    assert len(mesh.tris) > 2000
    # Shank must pass through the drawer plane (x = 0)
    assert mn[0] < -10
    assert mx[0] > 20
    # Room for fingers on T-bar (Z) and spout (Y)
    assert size[1] > 40
    assert size[2] > 40
    # Cabinet-knob scale, not a full garden tap
    assert size[0] < 120
    assert size.max() < 160

    write_binary_stl(OUT, mesh)
    data = OUT.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0]
    assert count == len(mesh.tris)
    assert len(data) == 84 + count * 50


if __name__ == "__main__":
    test_mesh_is_printable_handle()
    print("ok")

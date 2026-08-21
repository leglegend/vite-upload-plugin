#!/usr/bin/env python3
"""Generate a 3D-printable STL of an industrial garden-tap drawer handle.

Coordinate system (millimetres):
  origin  = centre of the mounting hole on the outer drawer face
  +X      = out of the drawer, into the room
  +Y      = along the drawer, toward the spout
  +Z      = up

The original threaded inlet becomes an M8 through-bolt so the piece
installs like a single-hole cabinet knob. The T-bar and down-turned
spout are the two grip surfaces.
"""

from __future__ import annotations

import math
import struct
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "models" / "faucet-drawer-handle.stl"


Vec = np.ndarray


def v(x, y, z) -> Vec:
    return np.array([x, y, z], dtype=np.float64)


class Mesh:
    def __init__(self) -> None:
        self.tris: list[tuple[Vec, Vec, Vec]] = []

    def add_tri(self, a, b, c) -> None:
        self.tris.append((np.asarray(a, float), np.asarray(b, float), np.asarray(c, float)))

    def add_quad(self, a, b, c, d) -> None:
        self.add_tri(a, b, c)
        self.add_tri(a, c, d)

    def extend(self, other: "Mesh") -> None:
        self.tris.extend(other.tris)

    def transform(self, matrix: np.ndarray) -> "Mesh":
        out = Mesh()
        r = matrix[:3, :3]
        t = matrix[:3, 3]
        for a, b, c in self.tris:
            out.add_tri(r @ a + t, r @ b + t, r @ c + t)
        return out


def translate(dx, dy, dz) -> np.ndarray:
    m = np.eye(4)
    m[:3, 3] = [dx, dy, dz]
    return m


def rotate_x(deg) -> np.ndarray:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    m = np.eye(4)
    m[1, 1], m[1, 2] = c, -s
    m[2, 1], m[2, 2] = s, c
    return m


def rotate_z(deg) -> np.ndarray:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    m = np.eye(4)
    m[0, 0], m[0, 1] = c, -s
    m[1, 0], m[1, 1] = s, c
    return m


def rotate_y(deg) -> np.ndarray:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    m = np.eye(4)
    m[0, 0], m[0, 2] = c, s
    m[2, 0], m[2, 2] = -s, c
    return m


def cylinder(
    p0: Vec,
    p1: Vec,
    r0: float,
    r1: float | None = None,
    segs: int = 32,
    caps: bool = True,
) -> Mesh:
    """Tapered cylinder from p0 to p1."""
    if r1 is None:
        r1 = r0
    axis = p1 - p0
    length = np.linalg.norm(axis)
    if length < 1e-9:
        return Mesh()
    z = axis / length
    tmp = v(1, 0, 0) if abs(z[0]) < 0.9 else v(0, 1, 0)
    x = np.cross(tmp, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    mesh = Mesh()
    ring0 = [p0 + r0 * (math.cos(t) * x + math.sin(t) * y) for t in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
    ring1 = [p1 + r1 * (math.cos(t) * x + math.sin(t) * y) for t in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
    for i in range(segs):
        j = (i + 1) % segs
        mesh.add_quad(ring0[i], ring0[j], ring1[j], ring1[i])
    if caps:
        for i in range(segs):
            j = (i + 1) % segs
            mesh.add_tri(p0, ring0[j], ring0[i])
            mesh.add_tri(p1, ring1[i], ring1[j])
    return mesh


def sphere(center: Vec, radius: float, segs: int = 20) -> Mesh:
    mesh = Mesh()
    stacks, slices = segs, segs * 2
    def pt(st, sl):
        phi = math.pi * st / stacks
        th = 2 * math.pi * sl / slices
        return center + radius * v(
            math.sin(phi) * math.cos(th),
            math.sin(phi) * math.sin(th),
            math.cos(phi),
        )
    for st in range(stacks):
        for sl in range(slices):
            a = pt(st, sl)
            b = pt(st, sl + 1)
            c = pt(st + 1, sl + 1)
            d = pt(st + 1, sl)
            if st == 0:
                mesh.add_tri(a, d, c)
            elif st == stacks - 1:
                mesh.add_tri(a, d, b)
            else:
                mesh.add_quad(a, b, c, d)
    return mesh


def hex_prism(origin: Vec, axis: Vec, across_flats: float, height: float) -> Mesh:
    """Hexagonal prism along axis, centred so origin is the start face centre."""
    r = across_flats / math.sqrt(3)
    z = axis / np.linalg.norm(axis)
    tmp = v(1, 0, 0) if abs(z[0]) < 0.9 else v(0, 1, 0)
    x = np.cross(tmp, z)
    x /= np.linalg.norm(x)
    yv = np.cross(z, x)
    p0 = origin
    p1 = origin + z * height
    mesh = Mesh()
    ring0, ring1 = [], []
    for i in range(6):
        ang = math.radians(30 + 60 * i)
        offset = r * (math.cos(ang) * x + math.sin(ang) * yv)
        ring0.append(p0 + offset)
        ring1.append(p1 + offset)
    for i in range(6):
        j = (i + 1) % 6
        mesh.add_quad(ring0[i], ring0[j], ring1[j], ring1[i])
        mesh.add_tri(p0, ring0[j], ring0[i])
        mesh.add_tri(p1, ring1[i], ring1[j])
    return mesh


def tube_along(points: list[Vec], radius: float, segs: int = 16) -> Mesh:
    """Sweep a circular cross-section along a polyline (open ends capped)."""
    mesh = Mesh()
    if len(points) < 2:
        return mesh
    rings = []
    for i, p in enumerate(points):
        if i == 0:
            tangent = points[1] - points[0]
        elif i == len(points) - 1:
            tangent = points[i] - points[i - 1]
        else:
            tangent = points[i + 1] - points[i - 1]
        z = tangent / (np.linalg.norm(tangent) + 1e-12)
        tmp = v(0, 0, 1) if abs(z[2]) < 0.9 else v(1, 0, 0)
        x = np.cross(tmp, z)
        x /= np.linalg.norm(x)
        yv = np.cross(z, x)
        ring = [p + radius * (math.cos(t) * x + math.sin(t) * yv) for t in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
        rings.append((p, ring))
    for i in range(len(rings) - 1):
        _, a = rings[i]
        _, b = rings[i + 1]
        for k in range(segs):
            j = (k + 1) % segs
            mesh.add_quad(a[k], a[j], b[j], b[k])
    _, first = rings[0]
    _, last = rings[-1]
    c0, c1 = rings[0][0], rings[-1][0]
    for k in range(segs):
        j = (k + 1) % segs
        mesh.add_tri(c0, first[j], first[k])
        mesh.add_tri(c1, last[k], last[j])
    return mesh


def thread_rings(p0: Vec, p1: Vec, r: float, count: int = 6) -> Mesh:
    mesh = Mesh()
    for i in range(count):
        t0 = (i + 0.15) / count
        t1 = (i + 0.55) / count
        a = p0 + (p1 - p0) * t0
        b = p0 + (p1 - p0) * t1
        mesh.extend(cylinder(a, b, r + 0.45, r + 0.45, segs=24, caps=True))
    return mesh


def build_handle() -> Mesh:
    m = Mesh()

    # --- mounting hardware (original inlet) ---
    # Inside drawer: hex nut + short leftover stud
    m.extend(hex_prism(v(-16, 0, 0), v(-1, 0, 0), across_flats=13, height=5.5))
    m.extend(cylinder(v(-16, 0, 0), v(8, 0, 0), 4.0, segs=28))  # M8 shank

    # Front hex boss (wrench flats of the original tap)
    m.extend(hex_prism(v(2.0, 0, 0), v(1, 0, 0), across_flats=24, height=9.0))

    # Decorative male threads just proud of the hex (visual of the original inlet)
    m.extend(thread_rings(v(10.5, 0, 0), v(18.5, 0, 0), r=6.2, count=5))
    m.extend(cylinder(v(10.5, 0, 0), v(20.0, 0, 0), 5.8, segs=28))

    # --- tap body (cast barrel) ---
    body_c = v(28.0, 10.0, 0.0)
    m.extend(sphere(body_c, 16.5, segs=22))
    m.extend(cylinder(body_c + v(-6, -8, 0), body_c + v(4, 16, 0), 14.2, 13.0, segs=28))
    # shoulder into the inlet
    m.extend(cylinder(v(18.0, 0.0, 0.0), body_c + v(-4, -6, 0), 8.5, 13.0, segs=24))

    # --- spout (down-turned, finger hook) ---
    spout = []
    for i in range(18):
        t = i / 17
        # sweep from body right-side, then curve down
        ang = t * math.radians(105)
        y = 22 + 28 * math.sin(min(ang, math.radians(90))) + 4 * t
        z = -4 - 22 * (1 - math.cos(ang))
        x = 28 + 4 * math.sin(t * math.pi)
        spout.append(v(x, y, z))
    m.extend(tube_along(spout, radius=7.2, segs=16))
    # spout lip
    lip = spout[-1]
    tangent = spout[-1] - spout[-2]
    tangent /= np.linalg.norm(tangent)
    m.extend(cylinder(lip, lip + tangent * 3.5, 7.2, 8.4, segs=20))
    m.extend(cylinder(lip + tangent * 3.2, lip + tangent * 5.5, 6.2, 6.2, segs=20))

    # --- brass-looking stem and T-handle ---
    stem_base = body_c + v(0, 1.5, 12)
    m.extend(cylinder(stem_base, stem_base + v(0, 0, 8), 7.5, 8.2, segs=24))  # packing nut
    m.extend(cylinder(stem_base + v(0, 0, 7), stem_base + v(0, 0, 28), 4.4, 4.2, segs=20))
    knob = stem_base + v(0, 0, 30)
    m.extend(sphere(knob, 7.2, segs=16))
    m.extend(cylinder(knob + v(0, -26, 0), knob + v(0, 26, 0), 4.6, segs=18))  # T-bar
    m.extend(sphere(knob + v(0, -26, 0), 5.0, segs=12))
    m.extend(sphere(knob + v(0, 26, 0), 5.0, segs=12))

    return m


def write_binary_stl(path: Path, mesh: Mesh, name: str = "faucet_drawer_handle") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = len(mesh.tris)
    header = name.encode("ascii", "ignore")[:80].ljust(80, b"\0")
    with path.open("wb") as f:
        f.write(header)
        f.write(struct.pack("<I", n))
        for a, b, c in mesh.tris:
            nrm = np.cross(b - a, c - a)
            ln = np.linalg.norm(nrm)
            if ln > 1e-12:
                nrm = nrm / ln
            else:
                nrm = np.zeros(3)
            f.write(struct.pack("<3f", *nrm))
            f.write(struct.pack("<3f", *a))
            f.write(struct.pack("<3f", *b))
            f.write(struct.pack("<3f", *c))
            f.write(struct.pack("<H", 0))


def bounds(mesh: Mesh) -> tuple[np.ndarray, np.ndarray]:
    pts = np.vstack([np.vstack(tri) for tri in mesh.tris])
    return pts.min(0), pts.max(0)


def main() -> None:
    mesh = build_handle()
    mn, mx = bounds(mesh)
    write_binary_stl(OUT, mesh)
    size = OUT.stat().st_size
    print(f"triangles: {len(mesh.tris)}")
    print(f"bbox_min_mm: {mn.round(2).tolist()}")
    print(f"bbox_max_mm: {mx.round(2).tolist()}")
    print(f"size_mm: {(mx - mn).round(2).tolist()}")
    print(f"wrote: {OUT} ({size} bytes)")
    # Mounting shank must cross the drawer plane x=0
    xs = np.array([p[0] for tri in mesh.tris for p in tri])
    assert xs.min() < -10, "inside nut missing"
    assert xs.max() > 20, "handle projection too short"
    assert len(mesh.tris) > 2000, "mesh too coarse"
    assert size > 10_000, "stl too small"


if __name__ == "__main__":
    main()

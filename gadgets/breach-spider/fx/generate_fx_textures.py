#!/usr/bin/env python3
"""Particle textures for the breach spider's effects (numpy + Pillow). Writes RGBA PNGs next to this file:

    spark.png   64 px   hot point with a soft halo (sparks, embers)
    glow.png    128 px  soft round glow (lance hit, fireball)
    smoke.png   128 px  soft noisy puff, white, tint it in the material (cut smoke, blast smoke, dust)
    flash.png   256 px  starburst for the blast flash
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)


def grid(n):
    y, x = np.mgrid[0:n, 0:n] + 0.5
    return (x / n - 0.5) * 2, (y / n - 0.5) * 2


def save(name, rgb, a):
    img = np.dstack([np.clip(rgb, 0, 1)] + [np.clip(a, 0, 1)])
    Image.fromarray((img * 255).astype(np.uint8), 'RGBA').save(os.path.join(HERE, name))


def noise(n, octaves=5):
    out = np.zeros((n, n))
    for o in range(octaves):
        s = 2 ** (o + 2)
        g = rng.random((s + 1, s + 1))
        img = np.array(Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)) / 255.0
        out += img / 2 ** o
    return out / out.max()


def main():
    x, y = grid(64); r = np.hypot(x, y)
    a = np.exp(-(r / 0.18) ** 2) + 0.5 * np.exp(-(r / 0.55) ** 2)
    save('spark.png', np.ones((64, 64, 3)), a * (r < 1))
    x, y = grid(128); r = np.hypot(x, y)
    save('glow.png', np.ones((128, 128, 3)), np.clip(1 - r, 0, 1) ** 2.2)
    n = noise(128)
    puff = np.clip(1 - r, 0, 1) ** 1.4 * (0.55 + 0.45 * n)
    save('smoke.png', np.ones((128, 128, 3)), np.clip(puff * 1.4, 0, 1) * (r < 1))
    x, y = grid(256); r = np.hypot(x, y); th = np.arctan2(y, x)
    rays = sum(np.exp(-((np.angle(np.exp(1j * (th - a0)))) / 0.035) ** 2) * w for a0, w in zip(rng.random(14) * 2 * np.pi, 0.4 + 0.6 * rng.random(14)))
    a = np.clip(np.exp(-(r / 0.22) ** 2) + rays * np.exp(-r / 0.55) * 0.8 + np.clip(1 - r, 0, 1) ** 3 * 0.4, 0, 1) * (r < 1)
    save('flash.png', np.ones((256, 256, 3)), a)


if __name__ == '__main__':
    main()

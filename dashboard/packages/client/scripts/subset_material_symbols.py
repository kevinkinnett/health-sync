"""Subset the Material Symbols ligature font to a list of icon names.

usage: subset_material_symbols.py FULL.woff2 NAMES.json OUT.woff2
       subset_material_symbols.py --list FULL.woff2 OUT.txt

An ordinary subset by text does nothing for a ligature icon font: every icon
name is spelled from a-z, 0-9 and "_", so keeping those characters keeps
every ligature that can be built from them -- i.e. all of them. Instead this
keeps the letter glyphs plus exactly the ligature glyphs for the requested
names, and turns OFF layout closure so the subsetter drops every other
ligature rather than pulling it back in.
"""

import json
import sys

from fontTools import subset
from fontTools.ttLib import TTFont


def ligature_targets(font: TTFont) -> dict[str, str]:
    """Map icon name -> ligature glyph name, read from the font's GSUB."""
    cmap = font.getBestCmap()
    char_of = {glyph: chr(code) for code, glyph in cmap.items()}
    targets: dict[str, str] = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if table.LookupType == 7:  # extension wrapper
                table = table.ExtSubTable
            if getattr(table, "LookupType", None) != 4:
                continue
            for first, ligatures in table.ligatures.items():
                for lig in ligatures:
                    parts = [first, *lig.Component]
                    if all(p in char_of for p in parts):
                        targets["".join(char_of[p] for p in parts)] = lig.LigGlyph
    return targets


def main(full: str, names_path: str, out: str) -> None:
    with open(names_path, encoding="utf-8") as fh:
        names = json.load(fh)
    font = TTFont(full)
    targets = ligature_targets(font)
    missing = [n for n in names if n not in targets]
    if missing:
        sys.exit(f"no ligature in the font for: {', '.join(missing)}")

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["liga", "rlig", "calt", "ccmp"]
    options.layout_closure = False
    options.name_IDs = ["*"]
    options.notdef_outline = True

    subsetter = subset.Subsetter(options)
    subsetter.populate(
        text="abcdefghijklmnopqrstuvwxyz0123456789_",
        glyphs=[targets[n] for n in names],
    )
    subsetter.subset(font)

    kept = ligature_targets(font)
    lost = [n for n in names if n not in kept]
    if lost:
        sys.exit(f"subset dropped ligatures for: {', '.join(lost)}")
    font.save(out)
    print(f"{len(names)} icons -> {out}")


def list_names(full: str, out: str) -> None:
    """Write every icon name the font has a ligature for, one per line."""
    names = sorted(ligature_targets(TTFont(full)))
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(names) + "\n")
    print(f"{len(names)} icon names -> {out}")


if __name__ == "__main__":
    if sys.argv[1] == "--list":
        list_names(sys.argv[2], sys.argv[3])
    else:
        main(*sys.argv[1:4])

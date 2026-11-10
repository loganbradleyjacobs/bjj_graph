"""
Interactive JSON snippet generator for moveset.json entries.

Prompts for either a node (position / predicament / submission) or a
move (edge), prints the snippet, and copies it to the clipboard.
"""

import json
import pyperclip


def ask(prompt: str, default: str = "") -> str:
    value = input(prompt).strip()
    return value if value else default


def ask_list(prompt: str) -> list[str]:
    items: list[str] = []
    print(f"{prompt} (press q to finish)")
    while True:
        item = input(f"  {len(items) + 1}. ").strip()
        if item == "q":
            break
        if item:
            items.append(item)
    return items


def ask_multiline(prompt: str) -> str:
    print(f"{prompt} (blank line to finish)")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if not line.strip():
            break
        lines.append(line)
    return "\n".join(lines)


def build_node() -> tuple[str, dict]:
    name = ask("Name: ")
    if not name:
        raise SystemExit("Node name is required.")

    kind = ask("Kind [p]osition / [r]edicament / [s]ubmission: ", "p").lower()
    if kind == "s":
        node_type = "Submission"
    elif kind == "r":
        node_type = "Predicament"
    else:
        node_type = ask("Position type (Guard/Control/Neutral): ", "Control")

    node: dict = {"type": node_type}

    area = ask_list("Area(s)")
    if area:
        node["area"] = area

    image = ask("Image path (blank to auto-derive): ")
    if image:
        node["image"] = image

    notes = ask_multiline("Notes")
    if notes:
        node["notes"] = notes

    images = ask_list("Detail image paths")
    if images:
        node["images"] = images

    videos = ask_list("Video URLs")
    if videos:
        node["videos"] = videos

    return name, node


def build_move() -> dict:
    move_type = ask(
        "Move type (Takedown/Sweep/Pass/Finish/Escape/Transition): ",
        "Transition",
    )
    name = ask("Move name (blank for unnamed transition): ")
    froms = ask_list("From positions")
    tos = ask_list("To positions")
    area = ask_list("Area(s)")
    notes = ask_multiline("Notes")

    move: dict = {"type": move_type}
    if name:
        move["name"] = name
    move["from"] = froms
    move["to"] = tos
    if area:
        move["area"] = area
    if notes:
        move["notes"] = notes
    return move


def main() -> None:
    print("moveset.json entry generator")
    print("  [n] node (position, predicament, or submission)")
    print("  [m] move (edge)")
    choice = ask("Choice [n/m]: ", "n").lower()

    if choice == "m":
        snippet = build_move()
        print("\nPaste this into the 'moves' array:")
    else:
        name, node = build_node()
        snippet = {name: node}
        print("\nPaste this into the 'positions' object:")

    rendered = json.dumps(snippet, indent=2)
    print(rendered)
    pyperclip.copy(rendered)
    print("\n(Copied to clipboard.)")


if __name__ == "__main__":
    main()

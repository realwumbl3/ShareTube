from __future__ import annotations

import argparse
import os
import getpass
from pathlib import Path


TEMPLATES = {
    # source -> destination relative to --output-dir
    "deploy/nginx/newapp.conf": "deploy/nginx/newapp.conf",
    "deploy/systemd/newapp.service": "deploy/systemd/newapp.service",
    "backend/gunicorn.conf.py": "backend/gunicorn.conf.py",
}


def load_text(path: Path) -> str:
    with path.open("r", encoding="utf-8") as f:
        return f.read()


def save_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Force LF newlines so files are ready for Linux deployment even if run on Windows
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def render_content(raw: str, username: str, project_path: str) -> str:
    """Apply ordered substitutions for placeholders and canonical paths.

    Order matters: resolve USERNAME/%i first, then replace canonical NewApp path
    with the provided project_path.
    """
    rendered = raw

    # Normalize project_path to have no trailing slash
    project_path = project_path.rstrip("/")

    # 1) Replace username tokens
    rendered = rendered.replace("USERNAME", username)
    rendered = rendered.replace("%i", username)

    # 2) Replace canonical NewApp base path (with the resolved username) with provided project_path
    canonical_base = f"/home/{username}/Dev/NewApp"
    rendered = rendered.replace(canonical_base, project_path)

    return rendered


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate deployment files from templates.")
    parser.add_argument("--this", action="store_true", help="Use current user and this script's directory as project root")
    parser.add_argument("--username", required=False, help="Target Linux username for deployment files")
    parser.add_argument(
        "--project-path",
        required=False,
        help="Absolute path on the server to the project root (e.g. /home/alice/Dev/NewApp)",
    )
    parser.add_argument(
        "--output-dir",
        default="build",
        help="Directory to write generated files into (default: build)",
    )

    args = parser.parse_args()
    repo_root = Path(__file__).parent.resolve()

    # Derive inputs based on provided flags
    if args.this and (args.username or args.project_path):
        raise SystemExit("--this cannot be combined with --username or --project-path")

    if args.this:
        username = getpass.getuser()
        project_path = str(repo_root)
    else:
        if not args.username or not args.project_path:
            raise SystemExit("Provide both --username and --project-path, or use --this")
        username = args.username
        project_path = args.project_path

    for src_rel, dst_rel in TEMPLATES.items():
        src_path = repo_root / src_rel
        if not src_path.exists():
            raise FileNotFoundError(f"Template not found: {src_path}")

        raw = load_text(src_path)
        rendered = render_content(raw, username, project_path)

        dst_root = repo_root / args.output_dir
        dst_path = dst_root / Path(dst_rel)
        save_text(dst_path, rendered)
        print(f"Wrote {dst_path}")

    # Print follow-up commands for Linux servers
    linux_project_path = project_path if project_path.startswith("/") else f"/home/{username}/Dev/NewApp"
    service_name = "newapp"

    commands = [
        f'export PROJECT_ROOT="{linux_project_path}"',
        f'sudo systemctl link "$PROJECT_ROOT/build/deploy/systemd/{service_name}.service"',
        'sudo systemctl daemon-reload',
        f'sudo systemctl enable --now {service_name}.service',
        # Ensure correct ownership and permissions on the unix socket so Nginx (www-data) can read/write it
        f'sudo chown {username}:www-data "$PROJECT_ROOT/instance/{service_name}.sock" || true',
        f'sudo chmod 770 "$PROJECT_ROOT/instance/{service_name}.sock" || true',
        f'sudo ln -sf "$PROJECT_ROOT/build/deploy/nginx/{service_name}.conf" /etc/nginx/sites-enabled/{service_name}.conf',
        'sudo nginx -t && sudo systemctl reload nginx',
    ]
    print("--------------------------------")
    print("Run the following commands on the server to deploy the application:")
    print("--------------------------------")
    print("\n".join(commands))


if __name__ == "__main__":
    main()



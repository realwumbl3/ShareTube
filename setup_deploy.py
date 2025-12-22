from __future__ import annotations

import argparse
import os
import getpass
from pathlib import Path

# parse args to get the version
parser = argparse.ArgumentParser(
    description="Generate deployment files from templates."
)

APP_NAME = "ShareTube"


def load_text(path: Path) -> str:
    with path.open("r", encoding="utf-8") as f:
        return f.read()


def save_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Force LF newlines so files are ready for Linux deployment even if run on Windows
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def render_content(
    raw: str, username: str, project_path: str, version: str, port: int
) -> str:
    """Apply ordered substitutions for placeholders."""
    rendered = raw
    # Normalize project_path to have no trailing slash
    project_path = project_path.rstrip("/")
    # Replace placeholders
    rendered = rendered.replace("&USERNAME", username)
    rendered = rendered.replace("&VERSION", version)
    rendered = rendered.replace("&APP_NAME", APP_NAME)
    rendered = rendered.replace("&PROJECT_ROOT", project_path)
    rendered = rendered.replace("&LISTEN_PORT", str(port))
    return rendered


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate deployment files from templates."
    )
    parser.add_argument(
        "--this",
        action="store_true",
        help="Use current user and this script's directory as project root",
    )
    parser.add_argument(
        "--username", required=False, help="Target Linux username for deployment files"
    )
    parser.add_argument(
        "--project-path",
        required=False,
        help="Absolute path on the server to the project root (e.g. /home/alice/Dev/NewApp)",
    )
    parser.add_argument(
        "--output-dir",
        default="instance",
        help="Directory to write generated files into (default: build)",
    )
    parser.add_argument(
        "--version",
        default="v1",
        help="Version to use for the deployment (default: v1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5077,
        help="Port to use for the deployment (default: 5077)",
    )

    args = parser.parse_args()
    repo_root = Path(__file__).parent.resolve()

    BUILD_TEMPLATE_DIR = f"backend/{args.version}/tooling/build"

    templates: dict[str, str] = {
         # source -> destination relative to --output-dir
         f"{BUILD_TEMPLATE_DIR}/nginx.conf": f"{args.version}/deploy/nginx.conf",
         f"{BUILD_TEMPLATE_DIR}/service.service": f"{args.version}/deploy/service.service",
         f"{BUILD_TEMPLATE_DIR}/gunicorn.conf.py": f"{args.version}/deploy/gunicorn.conf.py",
        # new: background pool + target
        f"{BUILD_TEMPLATE_DIR}/service.bg.service": f"{args.version}/deploy/service.bg.service",
        f"{BUILD_TEMPLATE_DIR}/service.target": f"{args.version}/deploy/service.target",
        f"{BUILD_TEMPLATE_DIR}/gunicorn.bg.conf.py": f"{args.version}/deploy/gunicorn.bg.conf.py",
     }

    # Derive inputs based on provided flags
    if args.this and (args.username or args.project_path):
        raise SystemExit("--this cannot be combined with --username or --project-path")

    if args.this:
        username = getpass.getuser()
        project_path = str(repo_root)
    else:
        if not args.username or not args.project_path:
            raise SystemExit(
                "Provide both --username and --project-path, or use --this"
            )
        username = args.username
        project_path = args.project_path

    for src_rel, dst_rel in templates.items():
        src_path = repo_root / src_rel
        if not src_path.exists():
            raise FileNotFoundError(f"Template not found: {src_path}")

        raw = load_text(src_path)
        rendered = render_content(raw, username, project_path, args.version, args.port)

        dst_root = repo_root / args.output_dir
        dst_path = dst_root / Path(dst_rel)
        save_text(dst_path, rendered)
        print(f"Wrote {dst_path}")

    # Print follow-up commands for Linux servers
    linux_project_path = (
        project_path if project_path.startswith("/") else f"/home/{username}/Dev/NewApp"
    )


    commands = [
         f'export PROJECT_ROOT="{linux_project_path}"',
        # interactive pool
        f'sudo ln -sf "$PROJECT_ROOT/instance/{args.version}/deploy/service.service" /etc/systemd/system/{APP_NAME}.{args.version}.service',
        # background pool
        f'sudo ln -sf "$PROJECT_ROOT/instance/{args.version}/deploy/service.bg.service" /etc/systemd/system/{APP_NAME}.{args.version}.bg.service',
        # target (one restart command controls both)
        f'sudo ln -sf "$PROJECT_ROOT/instance/{args.version}/deploy/service.target" /etc/systemd/system/{APP_NAME}.{args.version}.target',
         "sudo systemctl daemon-reload",
        f"sudo systemctl enable --now {APP_NAME}.{args.version}.target",
         # Ensure correct ownership and permissions on the unix socket so Nginx (www-data) can read/write it
         f'sudo ln -sf "$PROJECT_ROOT/instance/ShareTube-nginx.conf" /etc/nginx/sites-enabled/ShareTube-nginx.conf',
         "sudo nginx -t && sudo systemctl reload nginx",
         # Run this command after the deployment is successful to ensure the correct ownership and permissions are set.
         f'sudo chmod 770 "$PROJECT_ROOT/instance/{args.version}/{APP_NAME}.sock" || true',
         f'sudo chown {username}:www-data "$PROJECT_ROOT/instance/{args.version}/{APP_NAME}.sock" || true',
     ]

    print("--------------------------------")
    print("Run the following commands on the server to deploy the application:")
    print("--------------------------------")
    print("\n".join(commands))


if __name__ == "__main__":
    main()

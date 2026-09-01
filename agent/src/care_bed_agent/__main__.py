from __future__ import annotations

import argparse
from pathlib import Path

from .api import AgentApi, create_http_server
from .bootstrap import build_default_system
from .llm import GlmChatClient, GlmSettings, load_env_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the intelligent care-bed Agent API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    load_env_file(Path(__file__).resolve().parents[2] / ".env")
    intent_settings = GlmSettings.intent_from_env()
    intent_model = GlmChatClient(intent_settings) if intent_settings.configured else None
    server = create_http_server(
        AgentApi(build_default_system(intent_model=intent_model, seed_family_demo=True)),
        host=args.host,
        port=args.port,
    )
    print(f"Care-bed Agent listening on http://{args.host}:{args.port}")
    model_status = "enabled" if intent_settings.configured else "disabled: GLM_API_KEY not set"
    print(f"GLM intent model: {intent_settings.model} ({model_status})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

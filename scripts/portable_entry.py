"""Launch the frozen offline application or its source-tree equivalent."""

from __future__ import annotations

import argparse
import errno
import socket
import sys
import webbrowser
from pathlib import Path

import uvicorn


def _port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "el puerto debe ser un entero entre 1 y 65535"
        ) from error
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("el puerto debe estar entre 1 y 65535")
    return port


class _ReadyServer(uvicorn.Server):
    def __init__(self, config: uvicorn.Config, *, url: str, no_browser: bool) -> None:
        super().__init__(config)
        self._url = url
        self._no_browser = no_browser

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets=sockets)
        if not self.started or self._no_browser:
            return
        try:
            opened = webbrowser.open(self._url, new=2)
        except Exception:
            opened = False
        if not opened:
            print(
                f"Boquitas está lista en {self._url}, pero no se pudo abrir el navegador.",
                file=sys.stderr,
                flush=True,
            )


def _project_root() -> Path:
    # PyInstaller places the entry module directly in _internal; source mode
    # keeps it under scripts/ beside the project root.
    script_directory = Path(__file__).resolve().parent
    if getattr(sys, "frozen", False):
        return script_directory
    return script_directory.parent


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inicia Boquitas localmente sin descargar dependencias."
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="no abre el navegador automáticamente",
    )
    parser.add_argument(
        "--port",
        type=_port,
        default=8000,
        metavar="PUERTO",
        help="puerto local entre 1 y 65535 (predeterminado: 8000)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    arguments = _arguments(argv)
    root = _project_root()
    frontend_dist = root / "web" / "dist"
    if not (frontend_dist / "index.html").is_file():
        print(
            "No se encontró web/dist/index.html. Vuelva a extraer el paquete completo "
            "o reconstruya el frontend antes de iniciar Boquitas.",
            file=sys.stderr,
        )
        return 1

    if not getattr(sys, "frozen", False):
        source_directory = root / "src"
        if source_directory.is_dir():
            sys.path.insert(0, str(source_directory))

    try:
        from boquitas.api import create_app

        app = create_app(frontend_dist=frontend_dist)
    except Exception:
        print(
            "No se pudo preparar Boquitas. Compruebe que el paquete esté completo "
            "y vuelva a extraerlo.",
            file=sys.stderr,
        )
        return 1

    address = ("127.0.0.1", arguments.port)
    url = f"http://{address[0]}:{address[1]}"
    try:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            listener.bind(address)
            listener.listen(socket.SOMAXCONN)
            listener.setblocking(False)
        except OSError:
            listener.close()
            raise

        config = uvicorn.Config(
            app,
            host=address[0],
            port=address[1],
            loop="asyncio",
            http="h11",
            ws="none",
            lifespan="on",
            access_log=False,
            log_level="info",
        )
        server = _ReadyServer(config, url=url, no_browser=arguments.no_browser)
        server.run(sockets=[listener])
    except OSError as error:
        if error.errno == errno.EADDRINUSE or getattr(error, "winerror", None) == 10048:
            print(
                f"El puerto {arguments.port} de 127.0.0.1 ya está ocupado. "
                "Cierre normalmente el servicio que lo usa o inicie Boquitas con "
                "--port y otro puerto disponible.",
                file=sys.stderr,
            )
        else:
            print(
                f"No se pudo abrir el servidor local en el puerto {arguments.port}. "
                "Revise la configuración de red local y vuelva a intentarlo.",
                file=sys.stderr,
            )
        return 1
    except Exception:
        print(
            "Boquitas no pudo iniciar el servidor local. Compruebe que el paquete "
            "esté completo y vuelva a iniciar el programa.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

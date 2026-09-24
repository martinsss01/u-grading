"""Fetch a Google Colab notebook from its share link as .ipynb bytes.

Only works for notebooks shared as "anyone with the link" (Drive) or hosted
on a public GitHub repo; there's no Google auth on the server.
"""

import json
import re
from urllib.parse import unquote

import httpx

MAX_NOTEBOOK_BYTES = 20 * 1024 * 1024

_DRIVE_ID = re.compile(r"(?:colab\.research\.google\.com/drive/|drive\.google\.com/(?:file/d/|open\?id=))([\w-]{10,})")
_GITHUB = re.compile(r"colab\.research\.google\.com/github/([^/]+)/([^/]+)/blob/(.+?\.ipynb)")


class ColabFetchError(Exception):
    pass


def _download_url(url: str) -> tuple[str, str]:
    """Return (download url, fallback filename) for a Colab/Drive/GitHub link."""
    if m := _GITHUB.search(url):
        owner, repo, rest = m.groups()
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{rest}", rest.rsplit("/", 1)[-1]
    if m := _DRIVE_ID.search(url):
        file_id = m.group(1)
        return f"https://drive.google.com/uc?export=download&id={file_id}", f"colab_{file_id[:8]}.ipynb"
    raise ColabFetchError("El enlace no es un notebook de Google Colab válido.")


def _filename_from_headers(headers: httpx.Headers) -> str | None:
    disposition = headers.get("content-disposition", "")
    m = re.search(r"filename\*=UTF-8''([^;]+)", disposition) or re.search(r'filename="([^"]+)"', disposition)
    return unquote(m.group(1)) if m else None


async def fetch_colab_notebook(url: str) -> tuple[str, bytes]:
    download_url, filename = _download_url(url.strip())
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            resp = await client.get(download_url)
    except httpx.HTTPError:
        raise ColabFetchError("No se pudo descargar el notebook. Inténtalo de nuevo.")

    content = resp.content
    if len(content) > MAX_NOTEBOOK_BYTES:
        raise ColabFetchError("El notebook es demasiado grande (máximo 20 MB).")
    try:
        if resp.status_code != 200:
            raise ValueError
        nb = json.loads(content)
        if "cells" not in nb:
            raise ValueError
    except ValueError:
        # Drive answers private files with an HTML login/permission page.
        raise ColabFetchError(
            "No se pudo leer el notebook. Compártelo como \"Cualquier persona con el enlace\" "
            "o sube el archivo .ipynb directamente."
        )

    name = _filename_from_headers(resp.headers) or filename
    if not name.endswith(".ipynb"):
        name += ".ipynb"
    return name, content

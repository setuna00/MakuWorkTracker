"""封面图处理：原图压缩到合理尺寸 + 生成缩略图。"""
import io
import secrets
from pathlib import Path
from typing import Tuple
from PIL import Image, ImageOps
from ..config import settings


def _resize_keep_ratio(img: Image.Image, max_dim: int) -> Image.Image:
    """等比缩放，最长边不超过 max_dim。小于则不动。"""
    w, h = img.size
    longest = max(w, h)
    if longest <= max_dim:
        return img
    ratio = max_dim / longest
    new_size = (int(w * ratio), int(h * ratio))
    return img.resize(new_size, Image.LANCZOS)


def save_cover(file_bytes: bytes, original_filename: str) -> Tuple[str, str]:
    """处理上传的封面图。
    返回：(原图相对路径, 缩略图相对路径)，相对于 data_dir。
    """
    settings.ensure_dirs()

    img = Image.open(io.BytesIO(file_bytes))
    img = ImageOps.exif_transpose(img)  # 修正 EXIF 旋转

    # 原图统一转 RGB JPEG（除非已是 PNG 透明）
    if img.mode in ("RGBA", "LA", "P"):
        # 保留透明度的话用 png/webp，简化起见统一转 RGB
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # 文件名：随机 hex（避免冲突）
    file_id = secrets.token_hex(8)

    # 原图（压缩后）
    cover = _resize_keep_ratio(img, settings.cover_max_dim)
    cover_filename = f"{file_id}.jpg"
    cover_path = settings.covers_dir / cover_filename
    cover.save(cover_path, format="JPEG", quality=settings.cover_quality, optimize=True)

    # 缩略图（webp 更省）
    thumb = _resize_keep_ratio(img, settings.thumb_max_dim)
    thumb_filename = f"{file_id}.webp"
    thumb_path = settings.thumbs_dir / thumb_filename
    thumb.save(thumb_path, format="WEBP", quality=settings.thumb_quality)

    # 返回相对路径（前端拼 /data/ 前缀访问）
    return (
        f"covers/{cover_filename}",
        f"covers/thumbs/{thumb_filename}",
    )


def delete_cover(cover_path: str | None, thumb_path: str | None) -> None:
    """删除作品时清理封面文件。"""
    for rel in (cover_path, thumb_path):
        if rel:
            full = settings.data_dir / rel
            try:
                full.unlink(missing_ok=True)
            except Exception:
                pass

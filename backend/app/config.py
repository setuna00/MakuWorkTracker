"""配置：通过环境变量配置，默认值适合 Docker 容器内运行。"""
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据目录（容器内挂载点）
    data_dir: Path = Path("/app/data")

    # 数据库
    db_filename: str = "db.sqlite"

    # 图片处理
    cover_max_dim: int = 1600  # 原图最长边
    thumb_max_dim: int = 400   # 缩略图最长边
    cover_quality: int = 85
    thumb_quality: int = 80

    # 备份
    backup_hour: int = 3  # 凌晨 3 点
    backup_minute: int = 0
    backup_retention: int = 30  # 保留 30 份

    # 时区（用于备份调度等）
    tz: str = "Australia/Sydney"

    @property
    def db_path(self) -> Path:
        return self.data_dir / self.db_filename

    @property
    def covers_dir(self) -> Path:
        return self.data_dir / "covers"

    @property
    def thumbs_dir(self) -> Path:
        return self.data_dir / "covers" / "thumbs"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.covers_dir, self.thumbs_dir,
                  self.backups_dir, self.exports_dir):
            d.mkdir(parents=True, exist_ok=True)

    class Config:
        env_prefix = "WT_"


settings = Settings()

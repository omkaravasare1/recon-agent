from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    # Free Gemini API key: https://aistudio.google.com/app/apikey
    gemini_api_key: str = Field(default="", env="GEMINI_API_KEY")

    # gemini-1.5-flash: free tier — 15 rpm, 1M tokens/day
    llm_model: str = Field(default="gemini-1.5-flash", env="LLM_MODEL")

    # Data paths — relative to the backend/ working directory
    data_dir:         str = Field(default="data/generated",   env="DATA_DIR")
    ground_truth_dir: str = Field(default="data/ground_truth", env="GROUND_TRUTH_DIR")
    logs_dir:         str = Field(default="logs",              env="LOGS_DIR")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure runtime directories exist
for _d in [settings.data_dir, settings.ground_truth_dir, settings.logs_dir]:
    Path(_d).mkdir(parents=True, exist_ok=True)

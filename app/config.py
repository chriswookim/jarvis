from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    zen_api_key: str
    zen_base_url: str = "https://opencode.ai/zen/v1"
    zen_model: str = "big-pickle"
    zen_memory_model: str = "big-pickle"

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    mail_imap_host: str = "kenca.synology.me"
    mail_imap_port: int = 993
    mail_smtp_host: str = "kenca.synology.me"
    mail_smtp_port: int = 465
    mail_user: str = ""
    mail_password: str = ""
    mail_folder: str = "INBOX"
    app_env: str = "production"
    data_dir: str = "/app/data"
    app_password: str = "jarvis2024"
    secret_key: str = "jarvis-secret-change-me"

    class Config:
        env_file = ".env"

settings = Settings()

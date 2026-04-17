from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg2://terminal:terminal@localhost:5432/clinic_terminal"

    mis_base_url: str = ""
    mis_user: str = ""
    mis_password: str = ""
    mis_api_key: str = ""
    mis_verify_tls: bool = True

    mis_clinicdata_url: str | None = None
    mis_patient_tickets_url: str | None = None
    mis_main_only: bool = True
    mis_clinic_guid: str | None = None
    mis_target_clinic_guid: str | None = None

    sync_days_ahead: int = 31
    sync_interval_minutes: int = 2
    slot_step_minutes: int = 30

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def mis_dictionary_url(self) -> str:
        if self.mis_clinicdata_url:
            return self.mis_clinicdata_url.rstrip("/")
        base = self.mis_base_url.rstrip("/")
        return f"{base}/hs/bwi/DictionaryData"

    def mis_tickets_url(self) -> str:
        if self.mis_patient_tickets_url:
            return self.mis_patient_tickets_url.rstrip("/")
        base = self.mis_base_url.rstrip("/")
        return f"{base}/hs/bwi/PatientTickets"


settings = Settings()

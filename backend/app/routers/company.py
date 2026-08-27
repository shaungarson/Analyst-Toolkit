from fastapi import APIRouter, HTTPException

from app.schemas.company import CompanyData
from app.services import company_data
from app.services.alpha_vantage import (
    ProviderNotConfiguredError,
    ProviderUnavailableError,
    RateLimitedError,
    TickerNotFoundError,
)

router = APIRouter(prefix="/api/company", tags=["company"])


@router.get("/{ticker}", response_model=CompanyData)
def get_company(ticker: str):
    try:
        return company_data.get_company_data(ticker)
    except TickerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RateLimitedError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

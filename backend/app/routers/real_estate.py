from fastapi import APIRouter

from app.calculations.real_estate import real_estate_sensitivity, underwrite_real_estate
from app.schemas.real_estate import RealEstateInputs, RealEstateResults, SensitivityResults

router = APIRouter(prefix="/api/real-estate", tags=["real-estate"])


@router.post("/underwrite", response_model=RealEstateResults)
def underwrite(inputs: RealEstateInputs):
    return underwrite_real_estate(**inputs.model_dump())


@router.post("/sensitivity", response_model=SensitivityResults)
def sensitivity(inputs: RealEstateInputs):
    return real_estate_sensitivity(**inputs.model_dump())

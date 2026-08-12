from fastapi import APIRouter

from app.calculations.real_estate import underwrite_real_estate
from app.schemas.real_estate import RealEstateInputs, RealEstateResults

router = APIRouter(prefix="/api/real-estate", tags=["real-estate"])


@router.post("/underwrite", response_model=RealEstateResults)
def underwrite(inputs: RealEstateInputs):
    return underwrite_real_estate(**inputs.model_dump())

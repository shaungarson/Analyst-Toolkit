from fastapi import APIRouter

from app.calculations.dcf import run_dcf
from app.schemas.dcf import DCFInputs, DCFResults

router = APIRouter(prefix="/api/dcf", tags=["dcf"])


@router.post("/valuation", response_model=DCFResults)
def valuation(inputs: DCFInputs):
    return run_dcf(**inputs.model_dump())

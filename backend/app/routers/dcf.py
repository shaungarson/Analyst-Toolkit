from fastapi import APIRouter

from app.calculations.dcf import dcf_sensitivity, run_dcf
from app.schemas.dcf import DCFInputs, DCFResults, DcfSensitivityResults

router = APIRouter(prefix="/api/dcf", tags=["dcf"])


@router.post("/valuation", response_model=DCFResults)
def valuation(inputs: DCFInputs):
    return run_dcf(**inputs.model_dump())


@router.post("/sensitivity", response_model=DcfSensitivityResults)
def sensitivity(inputs: DCFInputs):
    return dcf_sensitivity(**inputs.model_dump())

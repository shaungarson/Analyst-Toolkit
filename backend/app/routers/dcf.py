from fastapi import APIRouter, HTTPException

from app.calculations.dcf import NonFiniteResultError, dcf_sensitivity, run_dcf
from app.schemas.dcf import DCFInputs, DCFResults, DcfSensitivityResults

router = APIRouter(prefix="/api/dcf", tags=["dcf"])


@router.post("/valuation", response_model=DCFResults)
def valuation(inputs: DCFInputs):
    try:
        return run_dcf(**inputs.model_dump())
    except NonFiniteResultError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sensitivity", response_model=DcfSensitivityResults)
def sensitivity(inputs: DCFInputs):
    try:
        return dcf_sensitivity(**inputs.model_dump())
    except NonFiniteResultError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

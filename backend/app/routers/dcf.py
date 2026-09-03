from fastapi import APIRouter, HTTPException

from app.calculations.dcf import (
    NonFiniteResultError,
    dcf_sensitivity,
    driver_dcf_sensitivity,
    implied_fcf_growth_rate,
    run_dcf,
    run_driver_dcf,
)
from app.schemas.dcf import (
    DCFInputs,
    DCFResults,
    DcfSensitivityResults,
    DriverDCFInputs,
    DriverDCFResults,
    ReverseDCFInputs,
    ReverseDCFResult,
)

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


@router.post("/implied-growth", response_model=ReverseDCFResult)
def implied_growth(inputs: ReverseDCFInputs):
    try:
        return implied_fcf_growth_rate(**inputs.model_dump())
    except NonFiniteResultError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/driver-valuation", response_model=DriverDCFResults)
def driver_valuation(inputs: DriverDCFInputs):
    try:
        return run_driver_dcf(**inputs.model_dump())
    except NonFiniteResultError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/driver-sensitivity", response_model=DcfSensitivityResults)
def driver_sensitivity(inputs: DriverDCFInputs):
    try:
        return driver_dcf_sensitivity(**inputs.model_dump())
    except NonFiniteResultError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

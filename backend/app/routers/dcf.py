from fastapi import APIRouter, HTTPException

from app.calculations.dcf import (
    NonFiniteResultError,
    dcf_sensitivity,
    driver_dcf_sensitivity,
    driver_dcf_tornado,
    driver_growth_margin_sensitivity,
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
    DriverGrowthMarginResults,
    DriverTornadoResults,
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


@router.post("/driver-tornado", response_model=DriverTornadoResults)
def driver_tornado(inputs: DriverDCFInputs):
    """Takes the same DriverDCFInputs payload as /driver-valuation - the base case is
    recomputed here alongside the twelve perturbations rather than being passed in, so a
    tornado can never be drawn against a base the client assembled separately.
    """
    try:
        return driver_dcf_tornado(**inputs.model_dump())
    except NonFiniteResultError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/driver-growth-margin", response_model=DriverGrowthMarginResults)
def driver_growth_margin(inputs: DriverDCFInputs):
    """Takes the same DriverDCFInputs payload as /driver-valuation. Like /driver-tornado, the
    base case is recomputed here alongside the twenty-four perturbed cells rather than being
    passed in, so the grid's deltas can never be measured against a base the client assembled
    or rounded separately.
    """
    try:
        return driver_growth_margin_sensitivity(**inputs.model_dump())
    except NonFiniteResultError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

"""
Step Functions Lambda: validate plate against SearchQuarry.

Chain:
  1. Upstash Redis cache (24hr TTL) — skip API call if cached
  2. SearchQuarry plate lookup — direct plate number → registration status

Result codes: valid | expired | suspended | stolen | unregistered | unknown

Required env vars (resolved from SSM at deploy time):
  UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
  SEARCHQUARRY_API_KEY
"""
import logging
import os

import redis
import requests

logger = logging.getLogger(__name__)

UPSTASH_URL          = os.environ.get("UPSTASH_REDIS_URL", "")
UPSTASH_TOKEN        = os.environ.get("UPSTASH_REDIS_TOKEN", "")
SEARCHQUARRY_API_KEY = os.environ.get("SEARCHQUARRY_API_KEY", "")
CACHE_TTL = 86400  # 24 hours

# SearchQuarry status strings → canonical codes
_STATUS_MAP = {
    "active":       "valid",
    "valid":        "valid",
    "expired":      "expired",
    "suspended":    "suspended",
    "revoked":      "suspended",
    "cancelled":    "suspended",
    "stolen":       "stolen",
    "unregistered": "unregistered",
    "not found":    "unregistered",
}


def _redis_client():
    if not UPSTASH_URL:
        return None
    return redis.Redis.from_url(UPSTASH_URL, password=UPSTASH_TOKEN, decode_responses=True)


def _cache_get(r, plate: str) -> str | None:
    if not r:
        return None
    try:
        return r.get(f"plate:{plate}") or None
    except Exception as exc:
        logger.warning("Redis GET failed: %s", exc)
        return None


def _cache_set(r, plate: str, status: str) -> None:
    if not r or status == "unknown":
        return
    try:
        r.setex(f"plate:{plate}", CACHE_TTL, status)
    except Exception as exc:
        logger.warning("Redis SET failed: %s", exc)


def _check_searchquarry(plate: str) -> str | None:
    """
    Call SearchQuarry license plate API.
    Docs: https://www.searchquarry.com/api-documentation/
    GET https://api.searchquarry.com/license_plate/?term=<PLATE>&api_key=<KEY>
    """
    if not SEARCHQUARRY_API_KEY:
        logger.warning("SEARCHQUARRY_API_KEY not set")
        return None
    try:
        resp = requests.get(
            "https://api.searchquarry.com/license_plate/",
            params={"term": plate, "api_key": SEARCHQUARRY_API_KEY},
            timeout=6,
        )
        if resp.status_code != 200:
            logger.warning("SearchQuarry HTTP %d for plate %s", resp.status_code, plate)
            return None

        data = resp.json()

        # Primary status field
        raw = (data.get("status") or data.get("registration_status") or "").lower().strip()
        if raw in _STATUS_MAP:
            return _STATUS_MAP[raw]

        # Fallback: message text
        message = (data.get("message") or "").lower()
        if "not found" in message or "no record" in message:
            return "unregistered"
        if "stolen" in message:
            return "stolen"

        logger.info("SearchQuarry unrecognised response for %s: %s", plate, data)
    except requests.RequestException as exc:
        logger.warning("SearchQuarry request error: %s", exc)
    return None


def handler(event: dict, context) -> dict:
    plate = event.get("plate_number", "")
    if not plate or plate == "UNKNOWN":
        return {**event, "validation_status": "unknown", "validation_source": "none"}

    r = _redis_client()

    cached = _cache_get(r, plate)
    if cached:
        logger.info("Cache hit: plate=%s status=%s", plate, cached)
        return {**event, "validation_status": cached, "validation_source": "cache"}

    status = _check_searchquarry(plate)
    source = "searchquarry"

    if not status:
        status = "unknown"
        source = "none"

    _cache_set(r, plate, status)
    logger.info("Validated plate=%s status=%s source=%s", plate, status, source)
    return {**event, "validation_status": status, "validation_source": source}

"""
backend/auth.py
JWT auth utilities — password hashing + token create/verify.
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
import bcrypt

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_RANDOM_32_CHARS")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days default

# Passlib is deprecated and buggy on Python 3.12+ (wraps library but fails on 72-char limit internally)
# We use direct bcrypt library for better compatibility.

def hash_password(plain: str) -> str:
    # Truncate to 72 bytes if necessary (bcrypt limit) to avoid ValueError
    pwd_bytes = plain.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def generate_id() -> str:
    return str(uuid.uuid4())


def encrypt_connection_password(password: str) -> str:
    """Simple XOR + Base64 encryption using SECRET_KEY."""
    import base64
    key_bytes = SECRET_KEY.encode()
    pw_bytes = password.encode()
    enc = bytes([pw_bytes[i] ^ key_bytes[i % len(key_bytes)] for i in range(len(pw_bytes))])
    return base64.b64encode(enc).decode()


def decrypt_connection_password(encrypted_pw: str) -> str:
    """Simple XOR decryption using SECRET_KEY."""
    import base64
    try:
        key_bytes = SECRET_KEY.encode()
        enc = base64.b64decode(encrypted_pw)
        dec = bytes([enc[i] ^ key_bytes[i % len(key_bytes)] for i in range(len(enc))])
        return dec.decode()
    except Exception:
        return ""

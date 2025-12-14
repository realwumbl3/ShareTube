# Future annotations for forward typing compatibility
from __future__ import annotations

# Standard library imports for timestamps and random state
import time
import secrets
from typing import Optional

# HTTP client for token exchange and Flask helpers for responses and redirects
import requests
from flask import Blueprint, current_app, jsonify, make_response, redirect, request

# Database session and models
from ...extensions import db
from ...models import User


# Create the authentication blueprint
auth_bp = Blueprint("auth", __name__)


# Helper to produce a signed JWT for a user using configured secret and expiration
def _issue_jwt(user: User) -> str:
    import jwt

    # Prepare JWT claims with subject, profile details, and expiry
    payload = {
        "sub": str(user.id),
        "name": user.name,
        "picture": user.picture,
        "exp": int(time.time()) + int(current_app.config["ACCESS_TOKEN_EXPIRES"]),
    }
    # Sign the token using HS256 with the configured JWT secret
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


# Start the Google OAuth flow by redirecting user to Google's consent page
@auth_bp.get("/auth/google/start")
def google_start():
    # Read client id from configuration; required to kick off OAuth
    client_id = current_app.config.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        return jsonify({"error": "google_oauth_not_configured"}), 500
    # Generate a CSRF protection state token stored in a cookie
    state = secrets.token_urlsafe(16)
    # Prepare a redirect to Google authorization endpoint with required params
    resp = make_response(
        redirect(
            "https://accounts.google.com/o/oauth2/v2/auth"
            + "?response_type=code"
            + f"&client_id={client_id}"
            + f"&redirect_uri={current_app.config['BACKEND_BASE_URL']}/auth/google/callback"
            + "&scope=openid%20email%20profile"
            + f"&state={state}"
        )
    )
    # Store the state in a cookie briefly to validate on callback
    resp.set_cookie("oauth_state", state, max_age=300, httponly=True, samesite="Lax")
    
    # Store the redirect target in a cookie if provided
    redirect_target = request.args.get('redirect')
    if redirect_target:
        resp.set_cookie("auth_redirect_target", redirect_target, max_age=300, httponly=True, samesite="Lax")
        
    return resp


# OAuth callback endpoint that exchanges code for tokens and provisions user
@auth_bp.get("/auth/google/callback")
def google_callback():
    # Validate CSRF state token from cookie against returned state param
    state_cookie = request.cookies.get("oauth_state")
    state = request.args.get("state")
    if not state_cookie or state_cookie != state:
        return jsonify({"error": "invalid_state"}), 400
        
    # Get the redirect target if any
    redirect_target = request.cookies.get("auth_redirect_target")
    
    # Extract one-time authorization code
    code = request.args.get("code")
    if not code:
        return jsonify({"error": "missing_code"}), 400
    # Exchange auth code for tokens at Google's token endpoint
    token_res = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": current_app.config["GOOGLE_CLIENT_ID"],
            "client_secret": current_app.config["GOOGLE_CLIENT_SECRET"],
            "redirect_uri": f"{current_app.config['BACKEND_BASE_URL']}/auth/google/callback",
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if token_res.status_code != 200:
        return jsonify({"error": "token_exchange_failed"}), 400
    # Parse returned tokens and decode id_token for user profile claims
    tokens = token_res.json()
    id_token = tokens.get("id_token")
    try:
        import jwt

        # For initial provisioning we skip signature verification here; upstream token check can be added
        claims = jwt.decode(
            id_token, options={"verify_signature": False, "verify_aud": False}
        )
    except Exception:
        return jsonify({"error": "invalid_id_token"}), 400

    # Extract profile details from claims
    google_sub = claims.get("sub")
    email = claims.get("email")
    name = claims.get("name")
    picture = claims.get("picture")
    if not google_sub:
        return jsonify({"error": "invalid_profile"}), 400

    # Find existing user by Google subject or create a new one
    user: Optional[User] = User.query.filter_by(google_sub=google_sub).first()
    if not user:
        user = User(google_sub=google_sub, email=email, name=name, picture=picture)
        db.session.add(user)
    else:
        # Update basic profile details on login
        user.email = email
        user.name = name
        user.picture = picture
    db.session.commit()

    # Issue an application JWT
    jwt_token = _issue_jwt(user)

    # Check if this is a dashboard login (redirect flow) or extension login (popup flow)
    if redirect_target == 'dashboard':
        # Dashboard flow: redirect back with token as cookie
        resp = make_response(redirect('/dashboard/'))
        resp.set_cookie(
            'auth_token',
            jwt_token,
            max_age=30*24*60*60,  # 30 days
            httponly=False,  # Allow JavaScript access
            samesite="Lax"
        )
        # Clean up the redirect cookie
        resp.delete_cookie('auth_redirect_target')
        return resp
    else:
        # Extension flow: use postMessage for popup
        return (
            "<script>window.opener && window.opener.postMessage({type:'newapp_auth', token:'%s'}, '*');window.close();</script>"
            % jwt_token
        )



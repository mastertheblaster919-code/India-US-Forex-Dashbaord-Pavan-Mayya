import os
from fyers_apiv3 import fyersModel
from dotenv import load_dotenv

load_dotenv()

def generate_access_token(auth_code):
    client_id = os.getenv("FYERS_APP_ID")
    secret_key = os.getenv("FYERS_SECRET_KEY")
    redirect_uri = os.getenv("FYERS_REDIRECT_URL", "https://www.google.com")
    token_file = os.getenv("FYERS_TOKEN_FILE", "fyers_token.txt")

    print(f"Generating token for client: {client_id}")
    
    session = fyersModel.SessionModel(
        client_id=client_id,
        secret_key=secret_key,
        redirect_uri=redirect_uri,
        response_type="code",
        grant_type="authorization_code"
    )
    session.set_token(auth_code)
    response = session.generate_token()
    
    if response.get("s") == "ok":
        access_token = response.get("access_token")
        with open(token_file, "w") as f:
            f.write(access_token)
        print(f"Success! Token saved to {token_file}")
        return True
    else:
        print(f"Error: {response.get('message')}")
        # Try with base client ID if full ID fails with hash error
        client_id_base = client_id.split("-")[0]
        print(f"Retrying with base client_id: {client_id_base}")
        session = fyersModel.SessionModel(
            client_id=client_id_base,
            secret_key=secret_key,
            redirect_uri=redirect_uri,
            response_type="code",
            grant_type="authorization_code"
        )
        session.set_token(auth_code)
        response = session.generate_token()
        if response.get("s") == "ok":
            access_token = response.get("access_token")
            with open(token_file, "w") as f:
                f.write(access_token)
            print(f"Success! Token saved to {token_file}")
            return True
        else:
            print(f"Final Error: {response.get('message')}")
            return False

if __name__ == "__main__":
    auth_url = "https://www.google.com/?s=ok&code=200&auth_code=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiJLQ0NOM1hPVlFVIiwidXVpZCI6ImVlMDYzYjRmYjU0ZTRiNWViYWQ0ZTVjNTY2OWI2Y2FjIiwiaXBBZGRyIjoiIiwibm9uY2UiOiIiLCJzY29wZSI6IiIsImRpc3BsYXlfbmFtZSI6IlhQMTI1NTEiLCJvbXMiOiJLMSIsImhzbV9rZXkiOiI4MWRkMmRjZWE0ZmNmNGEyMTliNzM3MGEwNjU2YTFkNDU3ODNhMGRhYjY5ZTQwMzZmZjAxZTdkZCIsImlzRGRwaUVuYWJsZWQiOiJOIiwiaXNNdGZFbmFibGVkIjoiTiIsImF1ZCI6IltcImQ6MVwiLFwiZDoyXCIsXCJ4OjBcIixcIng6MVwiLFwieDoyXCJdIiwiZXhwIjoxNzc2NTIwMzU3LCJpYXQiOjE3NzY0OTAzNTcsImlzcyI6ImFwaS5sb2dpbi5meWVycy5pbiIsIm5iZiI6MTc3NjQ5MDM1Nywic3ViIjoiYXV0aF9jb2RlIn0.fTgOfKlF2boFhyEiLteUzmXoyOmG5h6PHhPttUQtgsU&state=None"
    import urllib.parse as urlparse
    parsed = urlparse.urlparse(auth_url)
    params = urlparse.parse_qs(parsed.query)
    code = params.get("auth_code")[0]
    generate_access_token(code)

#!/usr/bin/env python3
"""
CLI Utility to create or reset administrator credentials in production.
Usage:
    python create_superuser.py --email admin@example.com --password SecretPassword123 --name "Administrator"
"""
import os
import sys
import asyncio
import argparse

from sqlalchemy import select
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import hash_password
from app.models.user import User

async def create_or_update_superuser(email: str, password: str, name: str, role: str):
    await init_db()
    email_clean = email.strip().lower()

    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.email == email_clean)
        res = await db.execute(stmt)
        user = res.scalars().first()

        if user:
            print(f"🔄 User '{email_clean}' already exists. Updating password and permissions...")
            user.hashed_password = hash_password(password)
            user.full_name = name or user.full_name
            user.role = role
            user.is_superuser = True
            user.is_active = True
            await db.commit()
            print(f"✅ Successfully updated superuser: {email_clean}")
        else:
            print(f"✨ Creating new superuser: {email_clean}...")
            new_user = User(
                email=email_clean,
                hashed_password=hash_password(password),
                full_name=name or "Administrator",
                role=role,
                is_active=True,
                is_superuser=True
            )
            db.add(new_user)
            await db.commit()
            print(f"✅ Successfully created superuser: {email_clean}")

def main():
    parser = argparse.ArgumentParser(description="Create or update production superuser account.")
    parser.add_argument("--email", required=True, help="Superuser login email")
    parser.add_argument("--password", required=True, help="Superuser login password")
    parser.add_argument("--name", default="System Administrator", help="Display name")
    parser.add_argument("--role", default="super_admin", choices=["super_admin", "admin", "operator"], help="User role")
    args = parser.parse_args()

    asyncio.run(create_or_update_superuser(args.email, args.password, args.name, args.role))

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Master ingestion script that runs all data sources sequentially.
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_script(script_name, args):
    """Runs a python script with arguments."""
    script_path = Path(__file__).parent / script_name
    
    # Resolve paths relative to workspace root (assuming script is in scripts/ingestion/)
    # We want to run from the workspace root to assume correct CWD for many scripts
    workspace_root = Path(__file__).resolve().parent.parent.parent
    
    cmd = [sys.executable, str(script_path)] + args
    
    logger.info(f"Running {script_name}...")
    try:
        result = subprocess.run(
            cmd, 
            cwd=workspace_root,
            check=True,
            text=True
        )
        logger.info(f"✓ {script_name} completed successfully.")
    except subprocess.CalledProcessError as e:
        logger.error(f"✗ {script_name} failed with exit code {e.returncode}.")
        sys.exit(e.returncode)

def main():
    # Define the scripts and their arguments
    # Paths are relative to workspace root because we set cwd=workspace_root
    ingestion_scripts = [
        (
            "prn_municipalities.py", 
            ["--file", "database/testdata/PRN-complete-data.json"]
        ),
        (
            "berkeley_zoning_tracker.py",
            ["--file", "database/testdata/zoning-tracker.csv"]
        ),
        (
            "mercatus.py",
            ["--file", "database/testdata/mercatus-2025-housing-bills.csv"]
        ),
        (
            "prn_state_legislation.py",
            []  # Downloads from Google Sheets automatically
        ),
        (
            "centerforbuilding.py",
            []  # Downloads from website automatically
        ),
        (
            "center_for_land_economics.py",
            []  # Downloads from Google Sheets automatically
        )
    ]

    # Enrichment scripts (run after ingestion)
    enrichment_scripts = [
        (
            "run_bill_scraping.py",
            ["--all"]  # Scrape all pending policy documents
        ),
        (
            "ai_enrichment.py",
            ["--all"]  # Enrich all unenriched reforms
        )
    ]

    print("========================================================")
    print("STARTING FULL INGESTION")
    print("========================================================")

    # Run all ingestion scripts
    for script, args in ingestion_scripts:
        run_script(script, args)

    print("========================================================")
    print("INGESTION COMPLETE - STARTING ENRICHMENT")
    print("========================================================")

    # Run enrichment scripts
    workspace_root = Path(__file__).resolve().parent.parent.parent
    for script, args in enrichment_scripts:
        # Enrichment scripts are in scripts/enrichment/, not scripts/ingestion/
        script_path = Path(__file__).parent.parent / "enrichment" / script
        cmd = [sys.executable, str(script_path)] + args
        
        logger.info(f"Running {script}...")
        try:
            result = subprocess.run(
                cmd,
                cwd=workspace_root,
                check=True,
                text=True
            )
            logger.info(f"✓ {script} completed successfully.")
        except subprocess.CalledProcessError as e:
            logger.error(f"✗ {script} failed with exit code {e.returncode}.")
            sys.exit(e.returncode)

    print("========================================================")
    print("ALL SCRIPTS COMPLETED SUCCESSFULLY")
    print("========================================================")

if __name__ == "__main__":
    main()

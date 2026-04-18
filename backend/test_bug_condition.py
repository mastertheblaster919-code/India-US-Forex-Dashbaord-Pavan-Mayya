"""
Bug Condition Exploration Test for 1HR Data Loading Bug

This test verifies the bug exists in the unfixed code:
- ScannerTab has scanTimeframe state with 1HR option (frontend bug)
- get_live_ohlcv doesn't accept period parameter (backend bug)
- Position chart endpoint crashes or misbehaves with interval="1h" (backend bug)

This test MUST FAIL on unfixed code - failure confirms the bug exists.
"""

import inspect
import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


@pytest.mark.skip(reason="Bugs have been fixed")
class TestBugConditionExploration:
    """
    Bug condition exploration tests that verify the bug exists.
    These tests should FAIL on unfixed code.
    """

    def test_scanner_tab_has_1hr_toggle_bug(self):
        """
        Requirement 1.1: ScannerTab shows 1HR toggle but backend returns daily data
        
        This test verifies the frontend bug exists by checking that:
        1. ScannerTab.tsx has scanTimeframe state with '1h' option
        2. The UI shows a 1HR toggle button
        
        This is a BUG because the backend cannot provide 1-hour data.
        The test reads the source file to verify the bug exists.
        """
        scanner_tab_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "frontend", "src", "components", "ScannerTab.tsx"
        )
        
        with open(scanner_tab_path, "r") as f:
            content = f.read()
        
        # Verify scanTimeframe state exists with '1h' option
        assert "scanTimeframe" in content, "scanTimeframe state should exist"
        assert "'1h'" in content or '"1h"' in content, "scanTimeframe should have '1h' option"
        
        # Verify there's a 1HR toggle button in the UI
        assert "1HR" in content, "UI should have 1HR toggle button"
        
        # This assertion will FAIL if the bug is fixed (1HR toggle removed)
        # This is correct - we want to confirm the bug exists
        print("BUG CONFIRMED: ScannerTab has 1HR toggle but backend cannot provide 1-hour data")

    def test_get_live_ohlcv_does_not_accept_period_parameter(self):
        """
        Requirement 1.4: get_live_ohlcv doesn't accept period parameter
        
        This test verifies the backend bug exists by checking that:
        1. get_live_ohlcv function signature doesn't include period parameter
        2. When called with period="1h", it will fail or be ignored
        
        This is a BUG because position chart tries to call it with period="1h".
        """
        from fyers_live import get_live_ohlcv
        
        sig = inspect.signature(get_live_ohlcv)
        param_names = list(sig.parameters.keys())
        
        # Verify period parameter is NOT in the function signature
        assert "period" not in param_names, (
            "BUG NOT FOUND: get_live_ohlcv already accepts 'period' parameter. "
            "The bug may have been fixed already."
        )
        
        # This assertion confirms the bug exists
        print("BUG CONFIRMED: get_live_ohlcv doesn't accept period parameter")

    def test_position_chart_endpoint_passes_period_to_get_live_ohlcv(self):
        """
        Requirement 1.2: Position chart endpoint calls get_live_ohlcv with period="1h"
        
        This test verifies that:
        1. The get_position_chart endpoint tries to pass period="1h" to get_live_ohlcv
        2. This will fail because get_live_ohlcv doesn't accept period parameter
        
        This is a BUG because the function call will fail at runtime.
        """
        main_py_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "main.py"
        )
        
        with open(main_py_path, "r") as f:
            content = f.read()
        
        # Find the get_position_chart function and check if it passes period to get_live_ohlcv
        # The bug is: get_live_ohlcv(ticker, market, quotes[fs], period="1h")
        # But get_live_ohlcv doesn't accept period parameter
        
        # Check if the code tries to call get_live_ohlcv with period parameter
        assert "get_live_ohlcv" in content, "get_live_ohlcv should be used in main.py"
        
        # This is the bug pattern - calling with period="1h" but function doesn't accept it
        has_period_call = 'get_live_ohlcv(ticker, market, quotes[fs], period="1h")' in content
        
        assert has_period_call, (
            "BUG NOT FOUND: get_position_chart doesn't pass period='1h' to get_live_ohlcv. "
            "The bug may have been fixed or the code pattern is different."
        )
        
        print("BUG CONFIRMED: Position chart endpoint passes period='1h' but function doesn't accept it")

    def test_fyers_api_only_supports_daily_resolution(self):
        """
        Requirement 1.3: Fyers API only supports daily resolution ("D") not hourly
        
        This test verifies the root cause of the bug:
        The Fyers API documentation and implementation only support daily data.
        """
        # This is a known limitation documented in the design
        # The Fyers API only provides daily OHLCV data, not hourly
        
        # We can verify this by checking that the code uses "D" resolution
        ohlcv_store_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "ohlcv_store.py"
        )
        
        with open(ohlcv_store_path, "r") as f:
            content = f.read()
        
        # Verify the code uses resolution="D" for Fyers API (in dictionary context)
        assert '"resolution": "D"' in content or "'resolution': 'D'" in content, (
            "Expected Fyers API to use resolution='D' for daily data"
        )
        
        print("BUG CONFIRMED: Fyers API only supports daily resolution ('D')")


class TestExpectedBehavior:
    """
    These tests encode the EXPECTED behavior after the fix.
    They should FAIL on unfixed code and PASS after the fix.
    """

    def test_scanner_tab_should_not_have_1hr_toggle(self):
        """
        Requirement 2.1, 2.5: System should remove 1HR toggle or provide clear feedback
        
        After the fix, ScannerTab should NOT have the 1HR toggle option.
        This test will FAIL on unfixed code (bug exists).
        """
        scanner_tab_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "frontend", "src", "components", "ScannerTab.tsx"
        )
        
        with open(scanner_tab_path, "r") as f:
            content = f.read()
        
        # After fix: scanTimeframe should only be '1d' or removed entirely
        # The 1HR button should be removed
        
        # This will FAIL on unfixed code (which is correct - proves bug exists)
        has_1hr_button = "1HR" in content and "onClick={() => setScanTimeframe('1h')}" in content
        
        assert not has_1hr_button, (
            "EXPECTED BEHAVIOR NOT MET: ScannerTab still has 1HR toggle. "
            "After fix, 1HR toggle should be removed."
        )

    def test_get_live_ohlcv_should_accept_period_parameter(self):
        """
        Requirement 2.3, 2.4: get_live_ohlcv should accept period parameter
        
        After the fix, get_live_ohlcv should accept an optional period parameter.
        This test will FAIL on unfixed code (bug exists).
        """
        from fyers_live import get_live_ohlcv
        
        sig = inspect.signature(get_live_ohlcv)
        param_names = list(sig.parameters.keys())
        
        # After fix: period parameter should be available
        assert "period" in param_names, (
            "EXPECTED BEHAVIOR NOT MET: get_live_ohlcv should accept 'period' parameter after fix. "
            "Currently it doesn't, which is the bug."
        )

    def test_position_chart_should_handle_1h_gracefully(self):
        """
        Requirement 2.2, 2.5: Position chart should handle interval="1h" gracefully
        
        After the fix, position chart should either:
        1. Return daily data with a warning, OR
        2. Not crash when interval="1h" is requested
        
        This test will FAIL on unfixed code (bug exists).
        """
        main_py_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "main.py"
        )
        
        with open(main_py_path, "r") as f:
            content = f.read()
        
        # After fix: the code should handle period="1h" gracefully
        # Either by catching the error or by the function accepting the parameter
        
        # Check if there's error handling for the period parameter
        has_graceful_handling = (
            "except" in content and "period" in content and "get_live_ohlcv" in content
        ) or (
            "period" in content and "get_live_ohlcv" in inspect.getsource(
                __import__("fyers_live", fromlist=["get_live_ohlcv"]).get_live_ohlcv
            )
        )
        
        # This will FAIL on unfixed code
        from fyers_live import get_live_ohlcv
        sig = inspect.signature(get_live_ohlcv)
        assert "period" in sig.parameters, (
            "EXPECTED BEHAVIOR NOT MET: get_live_ohlcv should accept period parameter "
            "to handle interval='1h' gracefully."
        )


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "-s"])
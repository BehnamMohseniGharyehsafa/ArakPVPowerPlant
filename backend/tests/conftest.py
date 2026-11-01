import pytest
from backend.app.config import Scenario
from backend.app.engine import simulate
from backend.app.weather import load_weather


@pytest.fixture(scope="session")
def weather():
    return load_weather()


@pytest.fixture(scope="session")
def reference(weather):
    return simulate(Scenario(), weather)

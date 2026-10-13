import pytest

from services import sentiment
from services.sentiment import analyze_sentiment


def test_positive_headline():
    result = analyze_sentiment("Shares soar after record profits and strong growth")
    assert result["label"] == "positive"
    assert 0 < result["score"] <= 1


def test_negative_headline():
    result = analyze_sentiment("Shares crash as company reports huge losses")
    assert result["label"] == "negative"
    assert -1 <= result["score"] < 0


def test_neutral_headline():
    result = analyze_sentiment("Company to hold annual meeting on Tuesday")
    assert result["label"] == "neutral"


@pytest.mark.parametrize(
    "compound, label",
    [
        (0.05, "positive"),
        (0.0499, "neutral"),
        (0.0, "neutral"),
        (-0.0499, "neutral"),
        (-0.05, "negative"),
    ],
)
def test_label_thresholds(monkeypatch, compound, label):
    monkeypatch.setattr(sentiment.analyzer, "polarity_scores", lambda text: {"compound": compound})
    assert analyze_sentiment("any headline") == {"label": label, "score": compound}

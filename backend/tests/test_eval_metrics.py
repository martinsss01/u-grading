from scripts.eval_llm import char_error_rate


def test_char_error_rate():
    assert char_error_rate("hola mundo", "hola  mundo\n") == 0
    assert char_error_rate("abcd", "abxd") == 0.25
    assert char_error_rate("", "") == 0

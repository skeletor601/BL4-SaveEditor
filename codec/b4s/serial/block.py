from typing import Optional
from codec.b4s.serial_datatypes.part.part import Part
from codec.b4s.serial_tokenizer.tokenizer import Token

class Block:
    def __init__(self, token: Token):
        self.token: Token = token
        self.value: int = 0
        self.value_str: str = ""
        self.part: Optional[Part] = None

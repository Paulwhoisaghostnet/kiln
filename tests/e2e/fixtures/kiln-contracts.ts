export const invalidMichelson = '(parameter (or (unit) (pair (string) (int))) (code (UNREACHABLE)))';

export const validMichelson = `
parameter string;
storage string;
code {
  CAR;
  NIL operation;
  PAIR;
};
`;

export const validSmartPy = `
default =
  sp.record()
`;

export const validSolidity = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Counter {
  uint256 public value;

  constructor(uint256 initialValue) {
    value = initialValue;
  }

  function inc() external {
    value += 1;
  }
}
`;

export const invalidSolidity = `
pragma solidity ^0.8.24;
contract Invalid {
  function foo() {
  
}
`;

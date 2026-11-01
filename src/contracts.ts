/**
 * VoiceConsult contract ABI and address.
 * Deployed on Arc Mainnet.
 */
import artifact from '../contracts/out/VoiceConsult.sol/VoiceConsult.json'

export const VOICE_CONSULT_ADDRESS = '0x1503c0c8D4faC99581C7Bd1f3f2eA3CD0405749f' as const

export const VOICE_CONSULT_ABI = artifact.abi

export const VOICE_CONSULT = {
  address: VOICE_CONSULT_ADDRESS,
  abi: VOICE_CONSULT_ABI,
} as const

// USDC on Arc Testnet
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

export const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

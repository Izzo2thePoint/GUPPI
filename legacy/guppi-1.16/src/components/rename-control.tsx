import {useEffect,useRef,useState} from 'react';
import {renameCommand} from '@/lib/crew-utilities';
import type {ActGame} from './live-data';
export function RenameControl({kind,id,name,disabled,act,onChanged}:{kind:'probe'|'manny'|'container';id:string;name:string;disabled:boolean;act:ActGame;onChanged?:()=>void}){
 const [value,setValue]=useState(name),[working,setWorking]=useState(false),[message,setMessage]=useState('');
 const previous=useRef({kind,id,name});
 useEffect(()=>{const old=previous.current;setValue(current=>old.kind!==kind||old.id!==id||current===old.name?name:current);if(old.kind!==kind||old.id!==id)setMessage('');previous.current={kind,id,name}},[kind,id,name]);
 return <details className="rename-control"><summary>Rename {kind}</summary><div className="row"><input aria-label={`New ${kind} name ${id}`} value={value} maxLength={kind==='manny'?40:80} disabled={disabled||working} onChange={e=>setValue(e.target.value)}/><button disabled={disabled||working||!value.trim()} onClick={async()=>{setWorking(true);setMessage('');try{await act(renameCommand(kind,id,value));setMessage('Name saved.');onChanged?.()}catch(e){setMessage((e as Error).message)}finally{setWorking(false)}}}>Save name</button></div>{message&&<p role="status">{message}</p>}</details>;
}


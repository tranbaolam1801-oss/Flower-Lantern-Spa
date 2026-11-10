import { useQuery } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
async function check(path:string) {
  const response = await fetch(`/api/health/${path}`,{credentials:'include'});
  if (!response.ok) throw new Error(path === 'ready'?'SQL Server chưa sẵn sàng.':'Backend chưa sẵn sàng.');
  return response.json();
}
export function SystemStatus() {
  const live = useQuery({queryKey:['health','live'],queryFn:()=>check('live')});
  const ready = useQuery({queryKey:['health','ready'],queryFn:()=>check('ready')});
  return <main className="system-page"><h1>Kiểm tra môi trường local</h1><p>Trang kỹ thuật phục vụ phát triển, không phải màn hình nghiệp vụ.</p>
    <p>Backend: {live.isPending?'Đang kiểm tra…':live.isError?live.error.message:'Đang hoạt động'}</p>
    <p>Database: {ready.isPending?'Đang kiểm tra…':ready.isError?ready.error.message:'SQL Server đã kết nối'}</p>
    <Button onClick={()=>{void live.refetch();void ready.refetch();}}>Kiểm tra lại</Button>
  </main>;
}

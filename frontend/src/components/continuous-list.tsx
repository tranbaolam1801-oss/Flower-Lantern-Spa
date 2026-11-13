import { useEffect, useRef } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';

interface Page<T> {items:T[];page:number;hasNext?:boolean;limit?:number}
export function useContinuousList<P extends Page<{id:string}>>({queryKey,queryFn,enabled=true}:{queryKey:QueryKey;queryFn:(page:number,signal:AbortSignal)=>Promise<P>;enabled?:boolean}) {
  const query=useInfiniteQuery({queryKey,enabled,initialPageParam:1,
    queryFn:({pageParam,signal})=>queryFn(pageParam,signal),
    getNextPageParam:last=>last.items.length>0&&(last.hasNext??(last.items.length===(last.limit??12)))?last.page+1:undefined,
  });
  const items=[...new Map(query.data?.pages.flatMap(page=>page.items).map(item=>[item.id,item])).values()];
  return {...query,isError:query.isError&&!query.data,data:query.data?{...query.data.pages[0],items}:undefined};
}
export function ContinuousListEnd({query}:{query:{hasNextPage:boolean;isFetching:boolean;isFetchNextPageError:boolean;fetchNextPage:()=>Promise<unknown>}}) {
  const end=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)&&query.hasNextPage&&!query.isFetching&&!query.isFetchNextPageError)void query.fetchNextPage();
    },{rootMargin:'0px 0px 240px 0px'});
    if(end.current)observer.observe(end.current);
    return ()=>observer.disconnect();
  },[query.hasNextPage,query.isFetching,query.isFetchNextPageError,query.fetchNextPage]);
  return <div ref={end} className="continuous-list-end">
    {query.isFetching&&<p role="status">Đang tải…</p>}
    {query.isFetchNextPageError&&<button type="button" onClick={()=>void query.fetchNextPage()}>Không thể tải thêm dữ liệu. Thử lại</button>}
  </div>;
}
